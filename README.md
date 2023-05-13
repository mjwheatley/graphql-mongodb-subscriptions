# graphql-mongodb-subscriptions

This repository was bootstrapped by cloning [graphql-redis-subscriptions](https://github.com/davidyaha/graphql-redis-subscriptions) and also referenced the [graphql-postgres-subscriptions](https://github.com/GraphQLCollege/graphql-postgres-subscriptions).

This package implements the PubSubEngine Interface from the [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) package and also the new AsyncIterator interface. 
It allows you to connect your subscriptions manager to a MongoDB Pub Sub mechanism to support 
multiple subscription manager instances.

## Installation
At first, install the `graphql-mongodb-subscriptions` package: 
```
npm install graphql-mongodb-subscriptions
```

As the [graphql-subscriptions](https://github.com/apollographql/graphql-subscriptions) package is declared as a peer dependency, you might receive warning about an unmet peer dependency if it's not installed already by one of your other packages. In that case you also need to install it too:
```
npm install graphql-subscriptions
```
   
## Using as AsyncIterator

Define your GraphQL schema with a `Subscription` type:

```graphql
schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}

type Subscription {
    somethingChanged: Result
}

type Result {
    id: String
}
```

Now, let's create a simple `MongodbPubSub` instance:

```javascript
import { MongodbPubSub } from 'graphql-mongodb-subscriptions';
const pubsub = new MongodbPubSub();
```

Now, implement your Subscriptions type resolver, using the `pubsub.asyncIterator` to map the event you need:

```javascript
const SOMETHING_CHANGED_TOPIC = 'something_changed';

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: () => pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC),
    },
  },
}
```

> Subscriptions resolvers are not a function, but an object with `subscribe` method, that returns `AsyncIterable`.

Calling the method `asyncIterator` of the `MongodbPubSub` instance will send MongoDB a `SUBSCRIBE` message to the topic provided and will return an `AsyncIterator` binded to the MongodbPubSub instance and listens to any event published on that topic.
Now, the GraphQL engine knows that `somethingChanged` is a subscription, and every time we will use `pubsub.publish` over this topic, the `MongodbPubSub` will `PUBLISH` the event over MongoDB to all subscribed instances and those in their turn will emit the event to GraphQL using the `next` callback given by the GraphQL engine.

```js
pubsub.publish(SOMETHING_CHANGED_TOPIC, { somethingChanged: { id: "123" }});
```

## Dynamically create a topic based on subscription args passed on the query

```javascript
export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: (_, args) => pubsub.asyncIterator(`${SOMETHING_CHANGED_TOPIC}.${args.relevantId}`),
    },
  },
}
```

## Using both arguments and payload to filter events

```javascript
import { withFilter } from 'graphql-subscriptions';

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: withFilter(
        (_, args) => pubsub.asyncIterator(`${SOMETHING_CHANGED_TOPIC}.${args.relevantId}`),
        (payload, variables) => payload.somethingChanged.id === variables.relevantId,
      ),
    },
  },
}
```

## Configuring MongodbPubSub

`MongodbPubSub` constructor can be passed a configuration object to enable some advanced features. 

`MongoPubSubChannelOptions` are used to change the default options for the capped collection that will be created. [View MongoDB capped collection docs](https://www.mongodb.com/docs/manual/core/capped-collections/)

```ts
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
```

| option               | type       | default         | description                                                                                                       |
|----------------------|------------|-----------------|-------------------------------------------------------------------------------------------------------------------|
| `connectionDb`       | `Db`       | `undefined`     | pass in an instance of a Mongo DB                                                                                 |
| `channelName`        | `string`   | `mubsub`        | The name of the capped collection to create inside the provided DB instance.                                      |
| `channelOptions`     | `MongoPubSubChannelOptions`   | { size: 100000 } | The options are used to configure the size and constraints of the MongoDB capped collection that will be created. |
| `connectionListener` | `function` | `undefined`     | pass in connection listener to log errors or make sure connection to the MubSub instance is actively listening.   |
| `commonMessageHandler` | `function` | `undefined`     | The default handler just passes the message object as is.  Use this to pass in a common message handler .         |

### commonMessageHandler

The common message handler gets called with the received document from MongoDB.
You can transform the message before it is passed to the individual filter/resolver methods of the subscribers.
This way it is for example possible to inject one instance of a [DataLoader](https://github.com/facebook/dataloader) which can be used in all filter/resolver methods.

```javascript
const getDataLoader = () => new DataLoader(...)
const commonMessageHandler = ({attributes: {id}, data}) => ({id, dataLoader: getDataLoader()})
const pubsub = new PostgresPubSub({ client, commonMessageHandler });
```

```javascript
export const resolvers = {
  Subscription: {
    somethingChanged: {
      resolve: ({ id, dataLoader }) => dataLoader.load(id)
    }
  }
};
```

### Test
```shell script
npm run test
```
