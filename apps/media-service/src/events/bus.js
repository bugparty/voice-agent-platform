const { EventEmitter } = require("events");

const eventBus = new EventEmitter();

function emitUiEvent(event) {
  eventBus.emit("ui-event", event);
}

function onUiEvent(listener) {
  eventBus.on("ui-event", listener);
  return () => eventBus.off("ui-event", listener);
}

module.exports = {
  emitUiEvent,
  onUiEvent
};
