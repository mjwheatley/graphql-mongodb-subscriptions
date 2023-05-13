import { parse, GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLFieldResolver } from 'graphql';
import { subscribe } from 'graphql/subscription';
import { MongodbPubSub, withFilter } from '../src';
import mongoose from 'mongoose';

const FIRST_EVENT = 'FIRST_EVENT';
// const SECOND_EVENT = 'SECOND_EVENT';

const {
  MONGODB_URI = 'mongodb://127.0.0.1:27017'
} = process.env;

function buildSchema(iterator, patternIterator) {
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        testString: {
          type: GraphQLString,
          resolve: function (_, args) {
            return 'works';
          }
        }
      }
    }),
    subscription: new GraphQLObjectType({
      name: 'Subscription',
      fields: {
        testSubscription: {
          type: GraphQLString,
          subscribe: withFilter(() => iterator, () => true) as GraphQLFieldResolver<any, any, any>,
          resolve: payload => {
            console.log(`testSubscription filter`, payload);
            return payload.timestamp;
          }
        },

        testPatternSubscription: {
          type: GraphQLString,
          subscribe: withFilter(() => patternIterator, () => true) as GraphQLFieldResolver<any, any, any>,
          resolve: payload => {
            return payload;
          }
        }
      }
    })
  });
}

const timeout = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

describe('PubSubAsyncIterator', function () {
  const query = parse(`
    subscription S1 {
      testSubscription
    }
  `);

  const patternQuery = parse(`
    subscription S1 {
      testPatternSubscription
    }
  `);

  let pubsub: MongodbPubSub;
  let origIterator;
  let origPatternIterator;
  let returnSpy;
  let schema;

  beforeAll(async () => {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('🎉 Connected to database successfully');
      const connectionDb = mongoose.connections[0].db;
      pubsub = new MongodbPubSub({
        // channelName: `pubsub-integration-test`,
        connectionDb,
        connectionListener: (event, data) => {
          console.log(`MongodbPubSub connectionListener`, { event, data });
        }
      });

      origIterator = pubsub.asyncIterator(FIRST_EVENT);
      origPatternIterator = pubsub.asyncIterator('SECOND*', { pattern: true });
      returnSpy = jest.spyOn(origIterator, 'return');
      schema = buildSchema(origIterator, origPatternIterator);
      await timeout(1000);
    } catch (error) {
      console.error(`Mongoose connect() error`, error);
    }
  });

  afterAll(async () => {
    pubsub.close();
    await timeout(1000);
    await mongoose.connections[0].close();
  });

  it('should allow subscriptions', () => {
      const payload = {
        timestamp: new Date().toISOString()
      };
      return subscribe({ schema, document: query })
        .then(async (ai) => {
          // tslint:disable-next-line:no-unused-expression
          expect(ai[Symbol.asyncIterator]).toBeDefined();

          const r = (ai as AsyncIterator<any>).next();
          await timeout(50);
          await pubsub.publish(FIRST_EVENT, payload);
          return r;
        })
        .then(res => {
          console.log(`subscript res`, JSON.stringify(res));
          expect(res.value?.data?.testSubscription).toEqual(payload.timestamp);
        });
    }
  );

  it('should clear event handlers', () =>
    subscribe({ schema, document: query })
      .then(async (ai) => {
        expect(ai[Symbol.asyncIterator]).toBeDefined();

        await pubsub.publish(FIRST_EVENT, {
          timestamp: new Date().toISOString()
        });

        return (ai as AsyncIterator<any>).return();
      })
      .then((_res) => {
        expect(returnSpy).toHaveBeenCalled();
      })
  );
});
