export default class Observers {
    constructor() {
        this.observers = [];
    }

    add({onfulfill, onreject}) {
        this.observer.push({onfulfill, onreject});
    }

    get() {
        this.observer.shift();
    }

    get hasNext() {
        return this.observers.length;
    }
}