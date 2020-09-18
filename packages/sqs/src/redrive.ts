import { Consumer } from "sqs-consumer";
import { Producer } from "sqs-producer";
import { Queue } from "./models/queue";
import { SQS } from "aws-sdk";
import { fromEvent, MonoTypeOperatorFunction, race, throwError } from "rxjs";
import {
  finalize,
  map,
  shareReplay,
  switchMap,
  take,
  takeUntil,
} from "rxjs/operators";

export const redrive = (
  src: Queue,
  dest: Queue,
  processedCb?: (messageId: string) => void
) => {
  const srcClient = new SQS(src);
  const destClient = new SQS(dest);

  let count = 0;
  const counter = () => {
    count++;
  };

  const isFIFO = /\.fifo$/.test(dest.endpoint);
  const target = Producer.create({
    sqs: destClient,
    queueUrl: dest.endpoint,
  });

  const source = Consumer.create({
    queueUrl: src.endpoint,
    sqs: srcClient,
    handleMessage: handleMessage(isFIFO, counter, target.send.bind(target)),
    messageAttributeNames: ["All"],
  });

  const obs = race(
    fromEvent(source, "error").pipe(throwOnEmit()),
    fromEvent(source, "processing_error").pipe(throwOnEmit()),
    fromEvent(source, "timeout_error").pipe(throwOnEmit()),
    fromEvent(source, "empty")
  ).pipe(
    finalize(() => source.stop()),
    take(1),
    shareReplay(),
    map(() => count)
  );
  if (processedCb) {
    fromEvent<{ MessageId: string }>(source, "message_processed")
      .pipe(
        // auto unsubscribe when finished
        takeUntil(obs)
      )
      .subscribe((message: { MessageId: string }) =>
        processedCb(message.MessageId)
      );
  }

  source.start();

  return obs;
};

const handleMessage = (
  isFIFO: boolean,
  counter: () => void,
  send: (payload: any) => Promise<any>
) => {
  return async (message: SQS.Types.Message) => {
    let payload: any = {
      id: message.MessageId,
      body: message.Body,
      messageAttributes: cleanMessageAttributes(message.MessageAttributes),
    };

    // For FIFO queue we need to make sure this message is unique and is in correct order
    if (isFIFO) {
      payload = {
        ...payload,
        groupId: "re-drive",
        deduplicationId: `${message.MessageId}_${Date.now()}`,
      };
    }
    await send(payload);
    counter();
  };
};

const cleanMessageAttributes = (
  attributes: SQS.Types.MessageBodyAttributeMap | undefined
): SQS.Types.MessageBodyAttributeMap | undefined => {
  if (!attributes) {
    return attributes;
  }
  const res: SQS.Types.MessageBodyAttributeMap = {};

  Object.keys(attributes).forEach((key) => {
    const clean = cleanMessageAttribute(attributes[key]);
    if (clean) {
      res[key] = clean;
    }
  });

  return res;
};
const cleanMessageAttribute = (
  attribute: SQS.Types.MessageAttributeValue
): SQS.Types.MessageAttributeValue | null => {
  if (attribute.DataType.includes("List")) {
    throw new Error("List types are not supported.");
  }
  const res: SQS.Types.MessageAttributeValue = {
    DataType: attribute.DataType,
  };
  // @ts-ignore
  res[`${attribute.DataType}Value`] = attribute[`${attribute.DataType}Value`];
  return res;
};
const throwOnEmit = <T>(): MonoTypeOperatorFunction<T> =>
  switchMap((err) => throwError(err));
