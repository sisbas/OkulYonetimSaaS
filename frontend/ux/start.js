import { mount } from "/app/ui.js";
import { createDemoStore } from "./store.js";
mount({ mode: "prototype", store: createDemoStore() });
