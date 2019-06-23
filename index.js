import State, { STATES } from './state';
import Observers from './observers.js';

// private map to store current state, value and settled status of each Promyse
// because those value are stored inside internal slots, so them are
// inacessible from outside
const instancesStatesMap = new Map();

// private map to store observers of each Promise
const instancesObserves = new Map();

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
        instancesObserves.set(this, new Observers());

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

            // we could simply return a Promyse immediately resolved/rejected
            promyseToBeReturned = new Promyse((resolve, reject) => {
                if (instanceStateValueSettledTuple.state === STATES.FULFILLED) {
                    try {
                        // The returned Promyse has to be resolved
                        // with the resulting value of the call to the
                        // onfulfill function passed to then
                        resolve(onfulfill(instanceStateValueSettledTuple.value));
                    } catch (e) {
                        // the 'onfulfill' observer passed to then
                        // could throw an error
                        // in such case, the returned Promyse should be rejected
                        reject(e);
                    }
                } else {
                    try {
                        // similar thing for the other case
                        reject(onreject(instanceStateValueSettledTuple.value));
                    } catch (e) {
                        reject(e);
                    }
                }
            });

        } else {
            // the Promyse on which then was called was not settled
            promyseToBeReturned = new Promyse((resolve, reject) => {
                // the returned Promyse will resolve/reject
                // after the Promyse on which then was called
                // is settled

                // this points to the Promyse on which then was called
                const observers = instancesObserves.get(this);

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
                            reject(onfulfill(value))
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
            onfulfill = x => x;
        }

        return this.then(
            // if the Promyse on which finally was called will resolve
            value => {
                try {
                    // we try to call onfinally cb
                    const onfinallyResult = onfinally();

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
                        return onfinally().then(
                            () => value
                        );
                    } else {
                        // if the resulting value of onfinally call is not a Promyse
                        // the promyse returned by finally should be fulfilled
                        // with the completion value of the Promyse
                        // on which the finally was called
                        // Promyse.resolve(2).finally(() => 98)); -> resolved 2
                        return value;
                    }

                } catch (e) {
                    // in case onfinally() has thrown an error
                    // the promyse returned by finally should be rejected with
                    // the reason of failing setted to the error just thrown
                    // Promyse.resolve(2).finally(() => { throw 98 }); -> rejected 98
                    throw e;
                }
            },
            reason => {
                try {
                    // we try to call onfinally cb
                    const onfinallyResult = onfinally();

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
                        return onfinally().then(
                            () => { throw reason }
                        );

                    } else {
                        // if the resulting value of confinally call is not a Promyse
                        // the promyse returned by finally should be rejected
                        // with the completion value of the Promyse
                        // on which the finally was called
                        // Promyse.reject(2).finally(() => 98)); -> rejected 2
                        throw reason;
                    }
                } catch (e) {
                    // in case onfinally() has thrown an error
                    // the promyse returned by finally should be rejected with
                    // the reason of failing setted to the error just thrown
                    // Promyse.reject(2).finally(() => { throw 98 }); -> rejected 98
                    throw e;
                }
            }
        );
    }

    // static resolve utility
    static resolve(value) {
        return value instanceof Promyse
            // do nothing if the values already is a Promyse
            ? value
            // esle wrap the value into a resolved Promyse
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
                                rejected(arrayOfRejections);
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

    // get info about the Promyse instance
    const instanceStateValueSettledTuple = instancesStatesMap.get(this);

    // resolve the Promyse only if it was not already resolved
    if (!instanceStateValueSettledTuple.settled) {
        // Promyse resolved with a Promyse shouldn't happen
        if (value instanceof Promyse) {
            // if the value is itself a Promyse, we have to unwrap it
            // thanks to 'then' method
            value.then(
                value => {
                    instancesStatesMap.set(this, new State(STATES.FULFILLED, value, true))
                },
                reason => {
                    instancesStatesMap.set(this, new State(STATES.REJECTED, reason, true))
                });
        } else {
            instancesStatesMap.set(this, new State(STATES.FULFILLED, value, true));
        }
    }

    // now all observer for the current Promyse should be notified and removed
    // from the observers collection (even because no Promyse could be resolved more than once)

    // get observers collection
    const observers = instancesObserves.get(this);
    // call all 'onfulfill' observers, removing each one from the collection
    while (observers.hasNext) {
        const { onfulfill } = observers.get();
        // promyses resolution must be deferred
        setTimeout(onfulfill, 0, instanceStateValueSettledTuple.value);
    };

    // no more need of the collection, because then method will acts differently
    // if the promyse is already settled
    instancesObserves.delete(this);
}

// reject function passed into the executor to reject a Promyse
function reject(reason) {
    // this pointer will be a Promyse instance

    const instanceStateValueSettledTuple = instancesStatesMap.get(this);
    // get info about the Promyse instance

    // reject the Promyse only if it was not already settled
    if (!instanceStateValueSettledTuple.settled) {
        // whichever reason is accepted, also a Promyse one
        instancesStatesMap.set(this, new State(STATES.REJECTED, reason, true));
    }

    // now all observer for the current Promyse should be notified and removed
    // from the observers collection (even because no Promyse could be rejected more than once)

    // get observers collection
    const observers = instancesObserves.get(this);
    // call all 'onreject' observers, removing each one from the collection
    while (observers.hasNext) {
        const { onreject } = observers.get();
        // promyses resolution must be deferred
        setTimeout(onreject, 0, instanceStateValueSettledTuple.value);
    };

    // no more need of the collection, because then method will acts differently
    // if the promyse is already settled
    instancesObserves.delete(this);
}