/**
 * test-services.ts - Demo script for task 2.2 verification
 *
 * Exercises loadServices(), resolveService(), and listServices().
 * Not shipped — used for manual demo verification only.
 */

import { loadServices, resolveService, listServices } from "./index";

const map = loadServices();
console.log(`Loaded services: ${JSON.stringify(listServices())}`);

const anthropic = resolveService("anthropic");
console.log(`Anthropic service: ${JSON.stringify(anthropic)}`);

const defaultService = resolveService();
console.log(`Default service: ${JSON.stringify(defaultService)}`);
