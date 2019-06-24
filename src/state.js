export const STATES = {
    PENDING: 'PENDING',
    FULFILLED: 'FULFILLED',
    REJECTED: 'REJECTED',
}

export default class State {
    constructor(state = STATES.PENDING, value = void 0, settled = false) {
        Object.assign(this, { _state: state, _value: value, _settled: settled });
    }

    get value() {
        return this._value;
    }

    get state() {
        return this._state;
    }

    get settled() {
        return this._settled;
    }
}