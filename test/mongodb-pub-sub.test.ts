import { MongodbPubSub } from '../src';
import { Db } from 'mongodb';

let listeners = [];

const unsubscribeMock = jest.fn().mockImplementation(() => {
  console.log(`unsubscribeMock()`);
  listeners.shift();
});
const publishMock = jest.fn().mockImplementation(
  (channel, message) => listeners.forEach((listener) => listener(channel, message))
);
const subscribeMock = jest.fn().mockImplementation(
  ({ event, callback }) => {
    console.log(`subscribeMock`, { event });
    listeners.push(callback);
    return {
      unsubscribe: unsubscribeMock
    };
  }
);

const mockEventEmitter = {
  publish: publishMock,
  subscribe: subscribeMock
};

jest.mock('@mawhea/mongopubsub', () => {
  return {
    MubSub: jest.fn().mockImplementation(() => {
      return mockEventEmitter;
    })
  };
});

const mockMongoDb: Db = jest.fn() as unknown as Db;
const mockOptions = {
  connectionDb: mockMongoDb
};

const timeout = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

describe('MongodbPubSub', () => {

  it('can subscribe to a specific trigger and receive messages published to it', async () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const triggerName = `Posts`;
    const payload = {
      timestamp: new Date().toISOString()
    };
    const onMessage = jest.fn().mockImplementation((message) => {
      console.log(`onMessage()`, { message });
      expect(message?.message?.timestamp).toEqual(payload.timestamp);
    });
    const subId = await pubSub.subscribe(triggerName, onMessage);
    expect(typeof subId).toBe('number');
    expect(subscribeMock).toHaveBeenCalledWith(expect.objectContaining({
      event: triggerName
    }));
    await pubSub.publish(triggerName, payload);
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      event: triggerName,
      message: payload
    }));
    expect(onMessage).toHaveBeenCalled();
    pubSub.unsubscribe(subId);
    expect(unsubscribeMock).toHaveBeenCalled();
  });


  it('cleans up correctly the memory when unsubscribing', async () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const triggerName = `Posts`;
    const subscriptionPromises = [
      pubSub.subscribe(triggerName, () => null),
      pubSub.subscribe(triggerName, () => null)
    ];
    const subIds = await Promise.all(subscriptionPromises);
    pubSub.unsubscribe(subIds[0]);
    expect(
      () => pubSub.unsubscribe(subIds[0])
    ).toThrow(`There is no subscription of id "${subIds[0]}"`);
    pubSub.unsubscribe(subIds[1]);
  });

  it('will unsubscribe individual subscriptions', async () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const triggerName = `Posts`;
    const payload = {
      timestamp: new Date().toISOString()
    };
    const onMessage1 = jest.fn().mockImplementation((_message) => {
      console.log(`Expect to not be called`);
    });
    const onMessage2 = jest.fn().mockImplementation((message) => {
      expect(message?.message?.timestamp).toEqual(payload.timestamp);
    });
    const subscriptionPromises = [
      pubSub.subscribe(triggerName, onMessage1),
      pubSub.subscribe(triggerName, onMessage2)
    ];

    const subIds = await Promise.all(subscriptionPromises);
    expect(subIds.length).toEqual(2);
    pubSub.unsubscribe(subIds[0]);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);

    await pubSub.publish(triggerName, payload);
    pubSub.unsubscribe(subIds[1]);
    expect(unsubscribeMock).toHaveBeenCalledTimes(2);

    expect(onMessage1).toHaveBeenCalledTimes(0);
    expect(onMessage2).toHaveBeenCalledTimes(1);
  });

  it('can have multiple subscribers and all will be called when a message is published to this channel', async () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const triggerName = `Posts`;
    const payload = {
      timestamp: new Date().toISOString()
    };
    const onMessage1 = jest.fn().mockImplementation((message) => {
      expect(message?.message?.timestamp).toEqual(payload.timestamp);
    });
    const onMessage2 = jest.fn().mockImplementation((message) => {
      expect(message?.message?.timestamp).toEqual(payload.timestamp);
    });
    const subscriptionPromises = [
      pubSub.subscribe(triggerName, onMessage1),
      pubSub.subscribe(triggerName, onMessage2)
    ];

    const subIds = await Promise.all(subscriptionPromises);
    expect(subIds.length).toEqual(2);
    await pubSub.publish(triggerName, payload);
    await timeout(50);
    expect(onMessage1).toHaveBeenCalledTimes(1);
    expect(onMessage2).toHaveBeenCalledTimes(1);

    pubSub.unsubscribe(subIds[0]);
    pubSub.unsubscribe(subIds[1]);
  });

  it('can publish objects as well', async () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const triggerName = `Posts`;
    const payload = {
      timestamp: new Date().toISOString()
    };
    const onMessage = jest.fn().mockImplementation((message) => {
      expect(message?.message?.timestamp).toEqual(payload.timestamp);
    });
    const subId = await pubSub.subscribe(triggerName, onMessage);
    await pubSub.publish(triggerName, payload);
    expect(publishMock).toHaveBeenCalledTimes(1);
    pubSub.unsubscribe(subId);
  });
  //
  // it('can accept custom reviver option (eg. for Javascript Dates)', done => {
  //   const dateReviver = (key, value) => {
  //     const isISO8601Z = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/;
  //     if (typeof value === 'string' && isISO8601Z.test(value)) {
  //       const tempDateNumber = Date.parse(value);
  //       if (!isNaN(tempDateNumber)) {
  //         return new Date(tempDateNumber);
  //       }
  //     }
  //     return value;
  //   };
  //
  //   const pubSub = new MongodbPubSub({ ...mockOptions, reviver: dateReviver });
  //   const validTime = new Date();
  //   const invalidTime = '2018-13-01T12:00:00Z';
  //   pubSub.subscribe('Times', message => {
  //     try {
  //       expect(message).to.have.property('invalidTime', invalidTime);
  //       expect(message).to.have.property('validTime');
  //       expect(message.validTime.getTime()).toEqual(validTime.getTime());
  //       done();
  //     } catch (e) {
  //       done(e);
  //     }
  //   }).then(async subId => {
  //     try {
  //       await pubSub.publish('Times', { validTime, invalidTime });
  //       pubSub.unsubscribe(subId);
  //     } catch (e) {
  //       done(e);
  //     }
  //   });
  // });
  //
  // it('refuses custom reviver with a deserializer', done => {
  //   const reviver = stub();
  //   const deserializer = stub();
  //
  //   try {
  //     expect(() => new MongodbPubSub({ ...mockOptions, reviver, deserializer }))
  //       .to.throw('Reviver and deserializer can\'t be used together');
  //     done();
  //   } catch (e) {
  //     done(e);
  //   }
  // });
  //
  // it('allows to use a custom serializer', done => {
  //   const serializer = stub();
  //   const serializedPayload = `{ "hello": "custom" }`;
  //   serializer.returnWith(serializedPayload);
  //
  //   const pubSub = new MongodbPubSub({ ...mockOptions, serializer });
  //
  //   try {
  //     pubSub.subscribe('TOPIC', message => {
  //       try {
  //         expect(message).to.eql({ hello: 'custom' });
  //         done();
  //       } catch (e) {
  //         done(e);
  //       }
  //     }).then(() => {
  //       pubSub.publish('TOPIC', { hello: 'world' });
  //     });
  //   } catch (e) {
  //     done(e);
  //   }
  // });
  //
  // it('custom serializer can throw an error', done => {
  //   const serializer = stub();
  //   serializer.throwWith(new Error('Custom serialization error'));
  //
  //   const pubSub = new MongodbPubSub({ ...mockOptions, serializer });
  //
  //   try {
  //     pubSub.publish('TOPIC', { hello: 'world' }).then(() => {
  //       done(new Error('Expected error to be thrown upon publish'));
  //     }, err => {
  //       expect(err.message).to.eql('Custom serialization error');
  //       done();
  //     });
  //   } catch (e) {
  //     done(e);
  //   }
  // });
  //
  // it('allows to use a custom deserializer', done => {
  //   const deserializer = stub();
  //   const deserializedPayload = { hello: 'custom' };
  //   deserializer.returnWith(deserializedPayload);
  //
  //   const pubSub = new MongodbPubSub({ ...mockOptions, deserializer });
  //
  //   try {
  //     pubSub.subscribe('TOPIC', message => {
  //       try {
  //         expect(message).to.eql({ hello: 'custom' });
  //         done();
  //       } catch (e) {
  //         done(e);
  //       }
  //     }).then(() => {
  //       pubSub.publish('TOPIC', { hello: 'world' });
  //     });
  //   } catch (e) {
  //     done(e);
  //   }
  // });
  //
  // it('unparsed payload is returned if custom deserializer throws an error', done => {
  //   const deserializer = stub();
  //   deserializer.throwWith(new Error('Custom deserialization error'));
  //
  //   const pubSub = new MongodbPubSub({ ...mockOptions, deserializer });
  //
  //   try {
  //     pubSub.subscribe('TOPIC', message => {
  //       try {
  //         expect(message).toBe('string');
  //         expect(message).to.eql('{"hello":"world"}');
  //         done();
  //       } catch (e) {
  //         done(e);
  //       }
  //     }).then(() => {
  //       pubSub.publish('TOPIC', { hello: 'world' });
  //     });
  //   } catch (e) {
  //     done(e);
  //   }
  // });
  //
  // it('throws if you try to unsubscribe with an unknown id', () => {
  //   const pubSub = new MongodbPubSub(mockOptions);
  //   return expect(() => pubSub.unsubscribe(123))
  //     .to.throw('There is no subscription of id "123"');
  // });
  //
  // it('can use transform function to convert the trigger name given into more explicit channel name', done => {
  //   const triggerTransform = (trigger, { repoName }) => `${trigger}.${repoName}`;
  //   const pubSub = new MongodbPubSub({
  //     triggerTransform,
  //     publisher: (mockRedisClient as any),
  //     subscriber: (mockRedisClient as any)
  //   });
  //
  //   const validateMessage = message => {
  //     try {
  //       expect(message).toEqual('test');
  //       done();
  //     } catch (e) {
  //       done(e);
  //     }
  //   };
  //
  //   pubSub.subscribe('comments', validateMessage, { repoName: 'graphql-redis-subscriptions' }).then(async subId => {
  //     await pubSub.publish('comments.graphql-redis-subscriptions', 'test');
  //     pubSub.unsubscribe(subId);
  //   });
  //
  // });

  afterEach(() => {
    publishMock.mockClear();
    subscribeMock.mockClear();
    unsubscribeMock.mockClear();
    listeners = [];
  });

  afterAll(() => {
    // restore();
  });

});

describe('PubSubAsyncIterator', () => {

  it('should expose valid asyncIterator for a specific event', () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const eventName = 'test';
    const iterator = pubSub.asyncIterator(eventName);
    expect(iterator).toBeDefined();
    expect(iterator[Symbol.asyncIterator]).toBeDefined();
  });

  it('should trigger event on asyncIterator when published', (done) => {
    const pubSub = new MongodbPubSub(mockOptions);
    const eventName = 'test';
    const iterator = pubSub.asyncIterator(eventName);

    iterator.next().then((result) => {
      expect(result).toBeDefined();
      expect(result.value).toBeDefined();
      expect(result.done).toBeDefined();
      done();
    });

    pubSub.publish(eventName, { test: true });
  });

  it('should not trigger event on asyncIterator when publishing other event', async () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const eventName = 'test2';
    const iterator = pubSub.asyncIterator('test');
    const triggerMock = jest.fn();
    iterator.next().then(triggerMock);
    await pubSub.publish(eventName, { test: true });
    expect(triggerMock).toBeCalledTimes(0);
  });

  it('register to multiple events', async () => {
    const pubSub = new MongodbPubSub(mockOptions);
    const event1 = `test1`;
    const event2 = `test2`;
    const payload = {
      timestamp: new Date().toISOString()
    };
    const iterator = pubSub.asyncIterator([event1, event2]);
    const onNext = jest.fn();
    iterator.next().then(onNext);
    await pubSub.publish(event1, payload);
    await timeout(50);
    iterator.next().then(onNext);
    await pubSub.publish(event2, payload);
    await timeout(50);
    expect(onNext).toBeCalledTimes(2);
  });

  it('should not trigger event on asyncIterator already returned', (done) => {
    const pubSub = new MongodbPubSub(mockOptions);
    const eventName = 'test';
    const iterator = pubSub.asyncIterator<any>(eventName);

    iterator.next().then((result) => {
      console.log(`iterator.next()`, { result });
      expect(result).toBeDefined();
      expect(result.value).toBeDefined();
      expect(result.value.message.test).toEqual('word');
      expect(result.done).toBe(false);
    });

    pubSub.publish(eventName, { test: 'word' }).then(() => {
      iterator.next().then((result) => {
        console.log(`iterator.next()`, { result });
        expect(result).toBeDefined();
        expect(result.value).toBeUndefined();
        expect(result.done).toBe(true);
        done();
      });

      iterator.return();
      pubSub.publish(eventName, { test: true });
    });
  });

});
