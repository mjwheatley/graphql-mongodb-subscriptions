import { PubSubEngine } from 'graphql-subscriptions';
import { PubSubAsyncIterator } from './pubsub-async-iterator';
import { MubSub } from '@mawhea/mongopubsub';
import { Db } from 'mongodb';

type OnMessage<T> = (message: T) => void

export type CommonMessageHandler = (message: any) => any;

export interface MongoPubSubChannelOptions {
  size: number;
  max: number;
}

export interface PubSubMongoDbOptions {
  connectionDb: Db;
  channelName?: string;
  channelOptions?: MongoPubSubChannelOptions;
  connectionListener?: (event: string, data: any) => void;
  commonMessageHandler?: CommonMessageHandler;
}

const defaultCommonMessageHandler: CommonMessageHandler = (message: any) => {
  console.log(`MongodbPubSub.defaultCommonMessageHandler()`, message);
  return message;
};

export class MongodbPubSub implements PubSubEngine {
  private channelName: string;
  private channel: MubSub;
  private commonMessageHandler: CommonMessageHandler;

  private readonly subscriptionMap: { [subId: number]: [string, any] };
  private readonly subsRefsMap: Map<string, Set<number>>;
  private currentSubscriptionId: number;

  constructor(options: PubSubMongoDbOptions) {
    const {
      connectionDb,
      channelName,
      channelOptions,
      connectionListener,
      commonMessageHandler
    } = options;
    this.subscriptionMap = {};
    this.subsRefsMap = new Map<string, Set<number>>();
    this.currentSubscriptionId = 0;
    this.channelName = channelName;
    this.commonMessageHandler = commonMessageHandler || defaultCommonMessageHandler;

    // this.client = mongopubsub(connectionDb);
    // this.channel = this.client.channel(this.channelName, channelOptions);
    this.channel = new MubSub({ mongoDb: connectionDb, ...channelOptions, name: channelName });
    if (connectionListener) {
      this.channel.on('error', (error: any) => {
        connectionListener(`error`, error);
      });
      this.channel.on(`ready`, (data) => {
        connectionListener(`channel ready`, data);
      });
    }
  }

  public async publish<T>(trigger: string, payload: T): Promise<void> {
    console.log(`MongodbPubSub publish()`, { trigger, payload });
    await this.channel.publish({ event: trigger, message: payload });
  }

  public subscribe<T = any>(
    trigger: string,
    onMessage: OnMessage<T>,
    options: unknown = {}
  ): Promise<number> {
    console.log(`MongodbPubSub subscribe()`, { trigger });
    const triggerName: string = trigger;
    const id = this.currentSubscriptionId++;
    const callback = (message) => {
      console.log(`MongodbPubSub subscription callback[${id}]`, message);
      onMessage(
        message instanceof Error
          ? message
          : this.commonMessageHandler(message)
      );
    };
    const subscription = this.channel.subscribe({ event: triggerName, callback });
    console.log(`subscription[${id}]`, `trigger[${triggerName}]`);

    this.subscriptionMap[id] = [triggerName, subscription];

    if (!this.subsRefsMap.has(triggerName)) {
      this.subsRefsMap.set(triggerName, new Set());
    }

    const refs = this.subsRefsMap.get(triggerName);
    refs.add(id);
    return Promise.resolve(id);
  }

  public unsubscribe(subId: number): void {
    console.log(`MongodbPubSub.unsubscribe()`, `subId[${subId}]`);
    console.log(`MongodbPubSub subscriptionMap`, this.subscriptionMap);
    const [triggerName = null, subscription] = this.subscriptionMap[subId] || [];
    const refs = this.subsRefsMap.get(triggerName);

    if (!subscription) {
      throw new Error(`There is no subscription of id "${subId}"`);
    }

    subscription.unsubscribe(triggerName);

    if (refs.size === 1) {
      this.subsRefsMap.delete(triggerName);
    } else {
      refs.delete(subId);
    }
    delete this.subscriptionMap[subId];
  }

  public asyncIterator<T>(triggers: string | string[], options?: unknown): AsyncIterator<T> {
    return new PubSubAsyncIterator<T>(this, triggers, options);
  }

  public close() {
    this.channel.close();
  }
}
