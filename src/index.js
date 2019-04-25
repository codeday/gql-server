import "@babel/polyfill";
import run from './server.js'

try {
  run();
} catch (e) {
  console.log(e, e.message, e.stack);
}