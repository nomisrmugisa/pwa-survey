export const EVENTS = {
    LOADING_SHOW: 'LOADING_SHOW',
    LOADING_HIDE: 'LOADING_HIDE',
    TOAST_SHOW: 'TOAST_SHOW'
};

class EventBus {
    constructor() {
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(l => l !== callback);
    }

    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }
}

export const eventBus = new EventBus();
