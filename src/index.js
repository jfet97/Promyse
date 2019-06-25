import State, { STATES } from './state';
import Observers from './observers.js';

// private map to store current state, value and settled status of each Promyse
// because those value are stored inside internal slots, so them are
// inacessible from outside
const instancesStatesMap = new WeakMap();

// private map to store observers of each Promise
const instancesObservers = new Map();

// check if an obj is a "thenable" using duck typing
function isThenable(obj) {
    return obj === Object(obj) && "then" in obj;
}

export class Promyse {
    constructor(executor) {
        // the executor is mandatory and must be a function
        if (typeof executor !== "function") {
            throw new TypeError(`The executor must be a function`);
        }

        // each instance will have own state-value-settled tuple
        // default values are STATES.PENDING for the state,
        // undefined for the value
        // false for settled
        instancesStatesMap.set(this, new State());

        // each instance will have own observers collection
        // a set of onfulfill-onreject functions pair
        instancesObservers.set(this, new Observers());

        // synchronously call the executor,
        // passing to it the resolve and the reject functions
        // binded to the current Promyse instance.
        // If an error is thrown, the Promyse must be rejected
        try {
            executor(resolve.bind(this), reject.bind(this));
        } catch (e) {
            reject.call(this, e);
        }
    }

    then(onfulfill, onreject) {

        // if both onfulfill and onreject weren't functions
        // a default callback is substituted respectively
        if (typeof onfulfill !== 'function') {
            onfulfill = x => x;
        }
        if (typeof onreject !== 'function') {
            onreject = x => { throw x };
        }

        // then returns a Promyse
        let promyseToBeReturned = null;

        // state info about the Promyse on which then was called
        const instanceStateValueSettledTuple = instancesStatesMap.get(this);

        // if the Promyse on which then was called was already settled
        if (instanceStateValueSettledTuple.settled) {

            // we could simply return a Promyse "immediately" resolved/rejected
            // "immediately" is in quotes because specs says that we have to defer it
            promyseToBeReturned = new Promyse((resolve, reject) => {
                if (instanceStateValueSettledTuple.state === STATES.FULFILLED) {
                    // the promyse was FULFILLED
                    setTimeout((v) => {
                        // The returned Promyse has to be resolved
                        // with the resulting value of the call to the
                        // onfulfill function passed to then
                        try {
                            resolve(onfulfill(v));
                        } catch (e) {
                            // the 'onfulfill' observer passed to then
                            // could throw an error
                            // in such case, the returned Promyse should be rejected
                            reject(e);
                        }

                    }, 0, instanceStateValueSettledTuple.value);

                } else {
                    // similar thing for the other case
                    // the promyse was REJECTED

                    setTimeout((v) => {
                        try {
                            // The returned Promyse has to be resolved
                            // with the resulting value of the call to the
                            // onreject function passed to then
                            resolve(onreject(v));
                        } catch (e) {
                            reject(e);
                        }

                    }, 0, instanceStateValueSettledTuple.value);

                }
            });

        } else {
            // the Promyse on which then was called was not settled
            promyseToBeReturned = new Promyse((resolve, reject) => {
                // the returned Promyse will resolve/reject
                // after the Promyse on which then was called
                // is settled

                // this points to the Promyse on which then was called
                const observers = instancesObservers.get(this);

                observers.add({
                    // if the the Promyse on which then was called
                    // will fulfill, all 'onfulfill' observers
                    // will be called with the resolution value.
                    // The returned Promyse has to be resolved
                    // with the resulting value of the call to the
                    // onfulfill function passed to then
                    onfulfill: value => {
                        try {
                            // the 'onfulfill' observer passed to then
                            // could throw an error
                            // in such case, the returned Promyse should be rejected
                            resolve(onfulfill(value))
                        } catch (e) {
                            reject(e);
                        }
                    },

                    // similar thing for the other case
                    onreject: value => {
                        try {
                            resolve(onreject(value))
                        } catch (e) {
                            reject(e);
                        }
                    }
                });
            });
        }

        return promyseToBeReturned;
    }

    catch(onreject) {
        // we implement the catch method using then

        // in case no error were fired, catch will simply
        // propagate the resolution value along
        return this.then(null, onreject);
    }

    finally(onfinally) {
        // we implement the finally method using then

        // if onfinally is not a function
        // a proper default cb is substituted
        if (typeof onfinally !== 'function') {
            onfinally = x => x;
        }

        return this.then(
            // if the Promyse on which finally was called will resolve
            value => {

                let onfinallyResult = null;
                try {
                    // we try to call onfinally cb
                    onfinallyResult = onfinally();

                } catch (e) {
                    // in case onfinally() has thrown an error
                    // the promyse returned by finally should be rejected with
                    // the reason of failing setted to the error just thrown
                    // Promyse.resolve(2).finally(() => { throw 98 }); -> rejected 98
                    throw e;
                }

                // if the resulting value of onfinally call is a Promyse
                if (onfinallyResult instanceof Promyse) {
                    // in case the onfinallyResult is resolved
                    // the promyse returned by finally should be fulfilled
                    // with the completion value of the Promyse
                    // on which the finally was called anyway
                    // Promyse.resolve(2).finally(() => Promyse.resolve(45)); -> resolved 2

                    // in case the onfinallyResult is rejected
                    // the promyse returned by finally should be rejected
                    // with the reason of rejecting onfinallyResult
                    // Promyse.resolve(2).finally(() => Promyse.reject(45)); -> rejected 45

                    return onfinallyResult.then(
                        () => value
                    );

                    // if the resulting value of onfinally call is a Thenable
                } else if (isThenable(onfinallyResult)) {


                    // if retrieving the property value.then results in a thrown exception e,
                    // the promyse returned by finally should be rejected with e as the reason
                    // Promyse.resolve(2).finally(() => ({ get then() { throw 34 } })); -> rejected 34
                    let then = null;
                    try {
                        then = onfinallyResult.then;
                    } catch (e) {
                        throw e; // remember, we are inside an onresolve
                    }

                    // if then is a method
                    // call method then of the thenable like it is a Promyse's then
                    if (typeof then === "function") {

                        let alreadyCalled = false;

                        const resRej = {};
                        const promyseToBeReturned = new Promyse((resolve, reject) => {
                            resRej.resolve = resolve;
                            resRej.reject = reject;
                        });

                        try {

                            then.call(
                                onfinallyResult,
                                // If both resolvePromise and rejectPromise are called,
                                // or multiple calls to the same argument are made,
                                // the first call takes precedence, and any further calls are ignored.
                                // In fact, we don't know how the thenable will behave

                                () => {
                                    // in case the thenable calls the resolve cb
                                    // the promyse returned by finally should be fulfilled
                                    // with the completion value of the Promyse
                                    // on which the finally was called anyway
                                    // Promyse.resolve(2).finally(() => ({then: resolve => resolve(42)})); -> resolved 2
                                    if (!alreadyCalled) {
                                        resRej.resolve(value);
                                        alreadyCalled = true;
                                    };
                                },
                                reason => {
                                    // in case thenable call the reject cb
                                    // the promyse returned by finally should be rejected
                                    // with the reason of rejecting onfinallyResult
                                    // Promyse.resolve(2).finally(() => ({then: (_, reject) => reject(42)})); -> rejected 42
                                    if (!alreadyCalled) {
                                        resRej.reject(reason);
                                        alreadyCalled = true;
                                    };
                                }
                            );
                        } catch (e) {
                            // If calling then throws an exception e,
                            // if one of two callbacks passed to then was called, ignore it.
                            // Otherwise, reject promyse with e as the reason.
                            // Promyse.resolve(2).finally(() => ({ then() { throw 34 } })); -> rejected 34
                            if (!alreadyCalled) {
                                resRej.reject(e);
                            }
                        }

                        // we have unwrapped the thenable, nothing else to do here
                        return promyseToBeReturned;

                    } else {
                        //  onfinally return a non-Promyse but thenable (where then is not a function) value
                        // Promyse.resolve(2).finally(() => ({ then : 4 })); -> resolve 2
                        return value;
                    }

                } else {
                    // if the resulting value of onfinally call is not a Promyse nor a thenable
                    // the promyse returned by finally should be fulfilled
                    // with the completion value of the Promyse
                    // on which the finally was called
                    // Promyse.resolve(2).finally(() => 98)); -> resolved 2
                    return value;
                }

            },
            reason => {

                let onfinallyResult = null;
                try {
                    // we try to call onfinally cb
                    onfinallyResult = onfinally();

                } catch (e) {
                    // in case onfinally() has thrown an error
                    // the promyse returned by finally should be rejected with
                    // the reason of failing setted to the error just thrown
                    // Promyse.reject(2).finally(() => { throw 98 }); -> rejected 98
                    throw e;
                }

                // if the resulting value of confinally call is a Promyse
                if (onfinallyResult instanceof Promyse) {
                    // in case the onfinallyResult is resolved
                    // the promyse returned by finally should be rejected
                    // with the completion value of the Promyse
                    // on which the finally was called anyway
                    // Promyse.reject(2).finally(() => Promyse.resolve(45)); -> rejected 2

                    // in case the onfinallyResult is rejected
                    // the promyse returned by finally should be rejected
                    // with the reason of rejecting onfinallyResult
                    // Promyse.reject(2).finally(() => Promyse.reject(45)); -> rejected 45
                    return onfinallyResult.then(
                        () => { throw reason }
                    );

                } else if (isThenable(onfinallyResult)) {


                    // if retrieving the property value.then results in a thrown exception e,
                    // the promyse returned by finally should be rejected with e as the reason
                    // Promyse.reject(2).finally(() => ({ get then() { throw 34 } })); -> rejected 34
                    let then = null;
                    try {
                        then = onfinallyResult.then;
                    } catch (e) {
                        throw e; // remember, we are inside an onreject
                    }

                    // if then is a method
                    // call method then of the thenable like it is a Promyse's then
                    if (typeof then === "function") {

                        let alreadyCalled = false;

                        const resRej = {};
                        const promyseToBeReturned = new Promyse((resolve, reject) => {
                            resRej.reject = reject;
                        });

                        try {

                            then.call(
                                onfinallyResult,
                                // If both resolvePromise and rejectPromise are called,
                                // or multiple calls to the same argument are made,
                                // the first call takes precedence, and any further calls are ignored.
                                // In fact, we don't know how the thenable will behave

                                () => {
                                    // in case the thenable calls the resolve cb
                                    // the promyse returned by finally should be rejected
                                    // with the completion value of the Promyse
                                    // on which the finally was called anyway
                                    // Promyse.reject(2).finally(() => ({then: resolve => resolve(42)})); -> rejected 2
                                    if (!alreadyCalled) {
                                        resRej.reject(value);
                                        alreadyCalled = true;
                                    };
                                },
                                reason => {
                                    // in case thenable call the reject cb
                                    // the promyse returned by finally should be rejected
                                    // with the reason of rejecting onfinallyResult
                                    // Promyse.reject(2).finally(() => ({then: (_, reject) => reject(42)})); -> rejected 42
                                    if (!alreadyCalled) {
                                        resRej.reject(reason);
                                        alreadyCalled = true;
                                    };
                                }
                            );
                        } catch (e) {
                            // If calling then throws an exception e,
                            // if one of two callbacks passed to then was called, ignore it.
                            // Otherwise, reject promyse with e as the reason.
                            // Promyse.reject(2).finally(() => ({ then() { throw 34 } })); -> rejected 34
                            if (!alreadyCalled) {
                                resRej.reject(e);
                            }
                        }

                        // we have unwrapped the thenable, nothing else to do here
                        return promyseToBeReturned;

                    } else {
                        //  onfinally return a non-Promyse but thenable (where then is not a function) value
                        // Promyse.reject(2).finally(() => ({ then : 4 })); -> reject 2
                        throw value;
                    }

                } else {
                    // if the resulting value of confinally call is not a Promyse nor a thenabke
                    // the promyse returned by finally should be rejected
                    // with the completion value of the Promyse
                    // on which the finally was called
                    // Promyse.reject(2).finally(() => 98)); -> rejected 2
                    throw reason;
                }
            }
        );
    }

    // static resolve utility
    static resolve(value) {
        return value instanceof Promyse
            // do nothing if the values already is a Promyse
            ? value
            // else wrap the value into a resolved Promyse
            // the resolve function will take care of thenables
            : new Promyse(resolve => {
                resolve(value);
            });
    }

    // static reject utility
    static reject(value) {
        return value instanceof Promyse
            // do nothing if the values already is a Promyse
            ? value
            // esle wrap the value into a rejected Promyse
            : new Promyse((resolve, reject) => {
                reject(value);
            });
    }

    // static all utility
    static all(iterable) {
        if (iterable === Object(iterable) && typeof iterable[Symbol.iterator] === "function") {
            // be sure that each element of the iterable is a Promyse
            const iterableOfPromyses = [...iterable].map(el => Promyse.resolve(el));
            const iterableOfPromysesLength = iterableOfPromyses.length;

            // empty iterable?
            if (iterableOfPromysesLength === 0) {
                // empty output
                return new Promyse(resolve => resolve([]));
            }

            // Promyse.all must return a Promise
            return new Promyse((resolve, reject) => {

                let arrayOfResults = [];

                iterableOfPromyses.forEach((promyse, idx) => {
                    promyse.then(
                        value => {
                            // put the result value into the arrayOfResults
                            // at the same index of the promyse into the iterable.
                            // Empty slots will be created, but the position of each resulting
                            // value into the arrayOfResults is equal to the position of the
                            // promyse into the iterable
                            arrayOfResults[idx] = value;

                            // if all Promyses contained into the iterable were fulfilled
                            // the promyse should be resolved with the arrayOfResults as completion value.
                            // The following check remove empty slots, then calculate the
                            // length of the arrayOfResults that is being built
                            // only if each promyse was successfully resolved the check could pass
                            // otherwise the real length of arrayOfResults will be minor than
                            // iterableOfPromysesLength one
                            if (arrayOfResults.map(el => el).length === iterableOfPromysesLength) {
                                resolve(arrayOfResults);
                            }
                        },
                        // as soon as any Promyse contained into the iterable
                        // will reject, the promise returned by Promyse.all
                        // must be rejected with the same reason
                        reason => reject(reason)
                    );
                });
            });

        } else {
            // iterable argument was not an iterable
            throw new TypeError(`Cannot read property 'Symbol(Symbol.iterator)' of ${String(iterable)}.`);
        }
    }

    // static any utility
    static any(iterable) {
        if (iterable === Object(iterable) && typeof iterable[Symbol.iterator] === "function") {
            // be sure that each element of the iterable is a Promyse
            const iterableOfPromyses = [...iterable].map(el => Promyse.resolve(el));
            const iterableOfPromysesLength = iterableOfPromyses.length;

            // empty iterable?
            if (iterableOfPromysesLength === 0) {
                // empty output
                return new Promyse(resolve => resolve([]));
            }

            // Promyse.any must return a Promise
            return new Promyse((resolve, reject) => {

                let arrayOfRejections = [];

                iterableOfPromyses.forEach((promyse, idx) => {
                    promyse.then(
                        // as soon as any Promyse contained into the iterable
                        // will resolve, the promise returned by Promyse.any
                        // must be resolved with the same reason
                        value => resolve(value),
                        reason => {
                            // put the result value into the arrayOfRejections
                            // at the same index of the promyse into the iterable.
                            // Empty slots will be created, but the position of each resulting
                            // value into the arrayOfRejections is equal to the position of the
                            // promyse into the iterable
                            arrayOfRejections[idx] = reason;

                            // if all Promyses contained into the iterable were rejected
                            // the promyse should be rejected with the arrayOfRejections as reason.
                            // The following check remove empty slots, then calculate the
                            // length of the arrayOfRejections that is being built
                            // only if each promyse was rejected the check could pass
                            // otherwise the real length of arrayOfRejections will be minor than
                            // iterableOfPromysesLength one
                            if (arrayOfRejections.map(el => el).length === iterableOfPromysesLength) {
                                reject(arrayOfRejections);
                            }
                        },
                    );
                });
            });

        } else {
            // iterable argument was not an iterable
            throw new TypeError(`Cannot read property 'Symbol(Symbol.iterator)' of ${String(iterable)}.`);
        }
    }

    // static allSettled utility
    static allSettled(iterable) {
        if (iterable === Object(iterable) && typeof iterable[Symbol.iterator] === "function") {
            // be sure that each element of the iterable is a Promyse
            const iterableOfPromyses = [...iterable].map(el => Promyse.resolve(el));
            const iterableOfPromysesLength = iterableOfPromyses.length;

            // empty iterable?
            if (iterableOfPromysesLength === 0) {
                // empty output
                return new Promyse(resolve => resolve([]));
            }

            // Promyse.allSettled must return a Promise
            return new Promyse((resolve, reject) => {

                let arrayOfRejections = [];

                function settleIntoArray(value, idx) {
                    // put the result value into the arrayOfResults
                    // at the same index of the promyse into the iterable.
                    // Empty slots will be created, but the position of each resulting
                    // value into the arrayOfResults is equal to the position of the
                    // promyse into the iterable
                    arrayOfRejections[idx] = value;

                    // if all Promyses contained into the iterable were completed
                    // the promyse should be resolved with the arrayOfResults as reason.
                    // The following check remove empty slots, then calculate the
                    // length of the arrayOfResults that is being built
                    // only if each promyse was completed the check could pass
                    // otherwise the real length of arrayOfResults will be minor than
                    // iterableOfPromysesLength one
                    if (arrayOfRejections.map(el => el).length === iterableOfPromysesLength) {
                        resolve(arrayOfRejections);
                    }
                }

                iterableOfPromyses.forEach((promyse, idx) => {
                    promyse.then(
                        value => settleIntoArray(value, idx),
                        reason => settleIntoArray(reason, idx)
                    );
                });
            });

        } else {
            // iterable argument was not an iterable
            throw new TypeError(`Cannot read property 'Symbol(Symbol.iterator)' of ${String(iterable)}.`);
        }
    }

    // static race utility
    static race(iterable) {
        if (iterable === Object(iterable) && typeof iterable[Symbol.iterator] === "function") {
            // be sure that each element of the iterable is a Promyse
            const iterableOfPromyses = [...iterable].map(el => Promyse.resolve(el));

            // Promyse.race must return a Promise
            return new Promyse((resolve, reject) => {
                iterableOfPromyses.forEach((promyse) => {
                    promyse.then(
                        // as soon as any Promyse contained into the iterable
                        // will resolve, the promise returned by Promyse.race
                        // must be resolved with the same reason
                        value => resolve(value),
                        // as soon as any Promyse contained into the iterable
                        // will reject, the promise returned by Promyse.race
                        // must be rejected with the same reason
                        reason => reject(reason)
                    );
                });
            });

        } else {
            // iterable argument was not an iterable
            throw new TypeError(`Cannot read property 'Symbol(Symbol.iterator)' of ${String(iterable)}.`);
        }
    }


}

// resolve function passed into the executor to fulfill a Promyse
function resolve(value) {
    // this pointer will be a Promyse instance

    // If this and value refer to the same object, reject promise with a TypeError as the reason.
    if (this === value) {
        throw TypeError('Cannot solve a Promyse with itself');
    }

    // resolve the Promyse only if it was not already resolved
    if (!instancesStatesMap.get(this).settled) {

        // Promyse resolved with a Promyse shouldn't happen
        if (value instanceof Promyse) {
            // if the value is itself a Promyse, we have to unwrap it
            // thanks to 'then' method
            value.then(
                value => {
                    // uuuh recursion
                    resolve.call(this, value);
                },
                reason => {
                    reject.call(this, reason);
                });

            // we have unwrapped the Promyse, nothing else to do here
            return;
        } else if (isThenable(value)) {
            // unwrap the thenable too

            // if retrieving the property value.then results in a thrown exception e,
            // reject the promyse with e as the reason
            let then = null;
            try {
                then = value.then;
            } catch (e) {
                reject.call(this, e);
                // we have handled the error inside then metod,
                // which took care of notify observers
                // nothing else to do here
                return;
            }

            // if then is a method
            // call method then of the thenable like it is a Promyse's then
            if (typeof then === "function") {

                let alreadyCalled = false;

                try {
                    then.call(
                        value,
                        // If both resolvePromise and rejectPromise are called,
                        // or multiple calls to the same argument are made,
                        // the first call takes precedence, and any further calls are ignored.
                        // In fact, we don't know how the thenable will behave
                        value => {
                            if (!alreadyCalled) {
                                resolve.call(this, value)
                                alreadyCalled = true;
                            };
                        },
                        reason => {
                            if (!alreadyCalled) {
                                reject.call(this, reason)
                                alreadyCalled = true;
                            };
                        }
                    );
                } catch (e) {
                    // If calling then throws an exception e,
                    // if one of two callbacks passed to then was called, ignore it.
                    // Otherwise, reject promyse with e as the reason.
                    if (!alreadyCalled) {
                        reject.call(this, e);
                    }
                }

                // we have unwrapped the thenable, nothing else to do here
                return;

            } else {
                // is a Promyse resolved with a non-Promyse but thenable (where then is not a function) value
                instancesStatesMap.set(this, new State(STATES.FULFILLED, value, true));
            }


        } else {
            // is a Promyse resolved with a non-thenable non-Promyse value
            instancesStatesMap.set(this, new State(STATES.FULFILLED, value, true));
        }

        // now all observer for the current Promyse should be notified and removed
        // from the observers collection (even because no Promyse could be resolved more than once)

        // get observers collection
        const observers = instancesObservers.get(this);
        // call all 'onfulfill' observers, removing each one from the collection
        while (observers.hasNext) {
            const { onfulfill } = observers.get();
            // promyses resolution must be deferred
            setTimeout(onfulfill, 0, instancesStatesMap.get(this).value);
            //Promise.resolve().then(() => onfulfill(instancesStatesMap.get(this).value));
        };

        // no more need of the collection, because then method will acts differently
        // if the promyse is already settled
        instancesObservers.delete(this);
    }

}

// reject function passed into the executor to reject a Promyse
function reject(reason) {
    // this pointer will be a Promyse instance

    // reject the Promyse only if it was not already settled
    if (!instancesStatesMap.get(this).settled) {
        // whichever reason is accepted, also a Promyse or a thenable one
        instancesStatesMap.set(this, new State(STATES.REJECTED, reason, true));

        // now all observer for the current Promyse should be notified and removed
        // from the observers collection (even because no Promyse could be rejected more than once)

        // get observers collection
        const observers = instancesObservers.get(this);
        // call all 'onreject' observers, removing each one from the collection
        while (observers.hasNext) {
            const { onreject } = observers.get();
            // promyses resolution must be deferred
            setTimeout(onreject, 0, instancesStatesMap.get(this).value);
            // Promise.resolve().then(() => onreject(instancesStatesMap.get(this).value));
        };

        // no more need of the collection, because then method will acts differently
        // if the promyse is already settled
        instancesObservers.delete(this);
    }
}