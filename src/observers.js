export default class Observers {
    constructor() {
        this.observers = [];
    }

    add({onfulfill, onreject}) {
        this.observers.push({onfulfill, onreject});
    }

    get() {
        return this.observers.shift();
    }

    get hasNext() {
        return this.observers.length;
    }
}