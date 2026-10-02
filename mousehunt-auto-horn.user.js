// ==UserScript==
// @name         MouseHunt Auto Horn & KR Solver (Kane)
// @namespace    https://greasyfork.org/en/users/979741
// @version      1.0.0
// @description  Sounds the hunter's horn after a random delay you choose and auto-solves King's Rewards. Never stops silently, reloads only when needed, and flags the tab if a King's Reward needs you. Pairs with MouseHunt Auto Disarm/Swap Bait (Kane) and Cerulean Skyport Autopilot (Kane).
// @author       Kane
// @license      MIT
// @match        https://www.mousehuntgame.com/*
// @match        https://mousehuntgame.com/*
// @icon         https://www.mousehuntgame.com/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * Copyright (c) 2026 Kane. MIT License.
 * Based on "Mousehunt Auto Horn & KR Solver", Copyright (c) 2023 Daniel Lok (daniellok), MIT License
 * (https://github.com/daniellok/mousehunt-auto-kr), and Slick's MIT fork (Greasy Fork script 575796).
 * Bundled Tesseract.js is Apache-2.0 (https://github.com/naptha/tesseract.js).
 *
 * The bundled Tesseract.js 4.0.2 below is unchanged. At King's Reward time it loads its worker script
 * (unpkg, tesseract.js@4.0.2), WebAssembly core and English language data (tessdata 4.0.0) from CDNs.
 *
 * Changes from the fork:
 *   - The main loop catches every error and keeps running; nothing can stop it silently.
 *   - One OCR worker per King's Reward, terminated afterwards (the fork leaked one per attempt).
 *   - OCR tuned for 5-character codes: letters/digits whitelist, single-line mode, 2x greyscale.
 *   - The captcha already on the page is read directly instead of being downloaded again.
 *   - Even random horn delay between min and max (the fork piled ~6% of horns on the minimum).
 *   - King's Rewards are noticed within a second, not only at horn time.
 *   - No alert() after failed attempts: one reload for a fresh code, then the tab title shows "⚠ KR"
 *     and it resumes once you solve it.
 *   - No 30-minute refresh: a watchdog reloads only when no horn has gone off for too long.
 *   - Reloads and horns wait while the Cerulean Skyport Autopilot is mid-action (window.mhSkyport.busy()).
 */

(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw new Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/regenerator-runtime/runtime.js
  var require_runtime = __commonJS({
    "node_modules/regenerator-runtime/runtime.js"(exports, module) {
      var runtime = function(exports2) {
        "use strict";
        var Op = Object.prototype;
        var hasOwn = Op.hasOwnProperty;
        var defineProperty = Object.defineProperty || function(obj, key, desc) {
          obj[key] = desc.value;
        };
        var undefined;
        var $Symbol = typeof Symbol === "function" ? Symbol : {};
        var iteratorSymbol = $Symbol.iterator || "@@iterator";
        var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
        var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";
        function define2(obj, key, value) {
          Object.defineProperty(obj, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true
          });
          return obj[key];
        }
        try {
          define2({}, "");
        } catch (err) {
          define2 = function(obj, key, value) {
            return obj[key] = value;
          };
        }
        function wrap(innerFn, outerFn, self, tryLocsList) {
          var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
          var generator = Object.create(protoGenerator.prototype);
          var context = new Context(tryLocsList || []);
          defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) });
          return generator;
        }
        exports2.wrap = wrap;
        function tryCatch(fn, obj, arg) {
          try {
            return { type: "normal", arg: fn.call(obj, arg) };
          } catch (err) {
            return { type: "throw", arg: err };
          }
        }
        var GenStateSuspendedStart = "suspendedStart";
        var GenStateSuspendedYield = "suspendedYield";
        var GenStateExecuting = "executing";
        var GenStateCompleted = "completed";
        var ContinueSentinel = {};
        function Generator() {
        }
        function GeneratorFunction() {
        }
        function GeneratorFunctionPrototype() {
        }
        var IteratorPrototype = {};
        define2(IteratorPrototype, iteratorSymbol, function() {
          return this;
        });
        var getProto = Object.getPrototypeOf;
        var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
        if (NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
          IteratorPrototype = NativeIteratorPrototype;
        }
        var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
        GeneratorFunction.prototype = GeneratorFunctionPrototype;
        defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: true });
        defineProperty(
          GeneratorFunctionPrototype,
          "constructor",
          { value: GeneratorFunction, configurable: true }
        );
        GeneratorFunction.displayName = define2(
          GeneratorFunctionPrototype,
          toStringTagSymbol,
          "GeneratorFunction"
        );
        function defineIteratorMethods(prototype) {
          ["next", "throw", "return"].forEach(function(method) {
            define2(prototype, method, function(arg) {
              return this._invoke(method, arg);
            });
          });
        }
        exports2.isGeneratorFunction = function(genFun) {
          var ctor = typeof genFun === "function" && genFun.constructor;
          return ctor ? ctor === GeneratorFunction || (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
        };
        exports2.mark = function(genFun) {
          if (Object.setPrototypeOf) {
            Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
          } else {
            genFun.__proto__ = GeneratorFunctionPrototype;
            define2(genFun, toStringTagSymbol, "GeneratorFunction");
          }
          genFun.prototype = Object.create(Gp);
          return genFun;
        };
        exports2.awrap = function(arg) {
          return { __await: arg };
        };
        function AsyncIterator(generator, PromiseImpl) {
          function invoke(method, arg, resolve, reject) {
            var record = tryCatch(generator[method], generator, arg);
            if (record.type === "throw") {
              reject(record.arg);
            } else {
              var result = record.arg;
              var value = result.value;
              if (value && typeof value === "object" && hasOwn.call(value, "__await")) {
                return PromiseImpl.resolve(value.__await).then(function(value2) {
                  invoke("next", value2, resolve, reject);
                }, function(err) {
                  invoke("throw", err, resolve, reject);
                });
              }
              return PromiseImpl.resolve(value).then(function(unwrapped) {
                result.value = unwrapped;
                resolve(result);
              }, function(error) {
                return invoke("throw", error, resolve, reject);
              });
            }
          }
          var previousPromise;
          function enqueue(method, arg) {
            function callInvokeWithMethodAndArg() {
              return new PromiseImpl(function(resolve, reject) {
                invoke(method, arg, resolve, reject);
              });
            }
            return previousPromise = // If enqueue has been called before, then we want to wait until
            // all previous Promises have been resolved before calling invoke,
            // so that results are always delivered in the correct order. If
            // enqueue has not been called before, then it is important to
            // call invoke immediately, without waiting on a callback to fire,
            // so that the async generator function has the opportunity to do
            // any necessary setup in a predictable way. This predictability
            // is why the Promise constructor synchronously invokes its
            // executor callback, and why async functions synchronously
            // execute code before the first await. Since we implement simple
            // async functions in terms of async generators, it is especially
            // important to get this right, even though it requires care.
            previousPromise ? previousPromise.then(
              callInvokeWithMethodAndArg,
              // Avoid propagating failures to Promises returned by later
              // invocations of the iterator.
              callInvokeWithMethodAndArg
            ) : callInvokeWithMethodAndArg();
          }
          defineProperty(this, "_invoke", { value: enqueue });
        }
        defineIteratorMethods(AsyncIterator.prototype);
        define2(AsyncIterator.prototype, asyncIteratorSymbol, function() {
          return this;
        });
        exports2.AsyncIterator = AsyncIterator;
        exports2.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
          if (PromiseImpl === void 0)
            PromiseImpl = Promise;
          var iter = new AsyncIterator(
            wrap(innerFn, outerFn, self, tryLocsList),
            PromiseImpl
          );
          return exports2.isGeneratorFunction(outerFn) ? iter : iter.next().then(function(result) {
            return result.done ? result.value : iter.next();
          });
        };
        function makeInvokeMethod(innerFn, self, context) {
          var state = GenStateSuspendedStart;
          return function invoke(method, arg) {
            if (state === GenStateExecuting) {
              throw new Error("Generator is already running");
            }
            if (state === GenStateCompleted) {
              if (method === "throw") {
                throw arg;
              }
              return doneResult();
            }
            context.method = method;
            context.arg = arg;
            while (true) {
              var delegate = context.delegate;
              if (delegate) {
                var delegateResult = maybeInvokeDelegate(delegate, context);
                if (delegateResult) {
                  if (delegateResult === ContinueSentinel)
                    continue;
                  return delegateResult;
                }
              }
              if (context.method === "next") {
                context.sent = context._sent = context.arg;
              } else if (context.method === "throw") {
                if (state === GenStateSuspendedStart) {
                  state = GenStateCompleted;
                  throw context.arg;
                }
                context.dispatchException(context.arg);
              } else if (context.method === "return") {
                context.abrupt("return", context.arg);
              }
              state = GenStateExecuting;
              var record = tryCatch(innerFn, self, context);
              if (record.type === "normal") {
                state = context.done ? GenStateCompleted : GenStateSuspendedYield;
                if (record.arg === ContinueSentinel) {
                  continue;
                }
                return {
                  value: record.arg,
                  done: context.done
                };
              } else if (record.type === "throw") {
                state = GenStateCompleted;
                context.method = "throw";
                context.arg = record.arg;
              }
            }
          };
        }
        function maybeInvokeDelegate(delegate, context) {
          var methodName = context.method;
          var method = delegate.iterator[methodName];
          if (method === undefined) {
            context.delegate = null;
            if (methodName === "throw" && delegate.iterator["return"]) {
              context.method = "return";
              context.arg = undefined;
              maybeInvokeDelegate(delegate, context);
              if (context.method === "throw") {
                return ContinueSentinel;
              }
            }
            if (methodName !== "return") {
              context.method = "throw";
              context.arg = new TypeError(
                "The iterator does not provide a '" + methodName + "' method"
              );
            }
            return ContinueSentinel;
          }
          var record = tryCatch(method, delegate.iterator, context.arg);
          if (record.type === "throw") {
            context.method = "throw";
            context.arg = record.arg;
            context.delegate = null;
            return ContinueSentinel;
          }
          var info = record.arg;
          if (!info) {
            context.method = "throw";
            context.arg = new TypeError("iterator result is not an object");
            context.delegate = null;
            return ContinueSentinel;
          }
          if (info.done) {
            context[delegate.resultName] = info.value;
            context.next = delegate.nextLoc;
            if (context.method !== "return") {
              context.method = "next";
              context.arg = undefined;
            }
          } else {
            return info;
          }
          context.delegate = null;
          return ContinueSentinel;
        }
        defineIteratorMethods(Gp);
        define2(Gp, toStringTagSymbol, "Generator");
        define2(Gp, iteratorSymbol, function() {
          return this;
        });
        define2(Gp, "toString", function() {
          return "[object Generator]";
        });
        function pushTryEntry(locs) {
          var entry = { tryLoc: locs[0] };
          if (1 in locs) {
            entry.catchLoc = locs[1];
          }
          if (2 in locs) {
            entry.finallyLoc = locs[2];
            entry.afterLoc = locs[3];
          }
          this.tryEntries.push(entry);
        }
        function resetTryEntry(entry) {
          var record = entry.completion || {};
          record.type = "normal";
          delete record.arg;
          entry.completion = record;
        }
        function Context(tryLocsList) {
          this.tryEntries = [{ tryLoc: "root" }];
          tryLocsList.forEach(pushTryEntry, this);
          this.reset(true);
        }
        exports2.keys = function(val) {
          var object = Object(val);
          var keys = [];
          for (var key in object) {
            keys.push(key);
          }
          keys.reverse();
          return function next() {
            while (keys.length) {
              var key2 = keys.pop();
              if (key2 in object) {
                next.value = key2;
                next.done = false;
                return next;
              }
            }
            next.done = true;
            return next;
          };
        };
        function values(iterable) {
          if (iterable) {
            var iteratorMethod = iterable[iteratorSymbol];
            if (iteratorMethod) {
              return iteratorMethod.call(iterable);
            }
            if (typeof iterable.next === "function") {
              return iterable;
            }
            if (!isNaN(iterable.length)) {
              var i = -1, next = function next2() {
                while (++i < iterable.length) {
                  if (hasOwn.call(iterable, i)) {
                    next2.value = iterable[i];
                    next2.done = false;
                    return next2;
                  }
                }
                next2.value = undefined;
                next2.done = true;
                return next2;
              };
              return next.next = next;
            }
          }
          return { next: doneResult };
        }
        exports2.values = values;
        function doneResult() {
          return { value: undefined, done: true };
        }
        Context.prototype = {
          constructor: Context,
          reset: function(skipTempReset) {
            this.prev = 0;
            this.next = 0;
            this.sent = this._sent = undefined;
            this.done = false;
            this.delegate = null;
            this.method = "next";
            this.arg = undefined;
            this.tryEntries.forEach(resetTryEntry);
            if (!skipTempReset) {
              for (var name in this) {
                if (name.charAt(0) === "t" && hasOwn.call(this, name) && !isNaN(+name.slice(1))) {
                  this[name] = undefined;
                }
              }
            }
          },
          stop: function() {
            this.done = true;
            var rootEntry = this.tryEntries[0];
            var rootRecord = rootEntry.completion;
            if (rootRecord.type === "throw") {
              throw rootRecord.arg;
            }
            return this.rval;
          },
          dispatchException: function(exception) {
            if (this.done) {
              throw exception;
            }
            var context = this;
            function handle(loc, caught) {
              record.type = "throw";
              record.arg = exception;
              context.next = loc;
              if (caught) {
                context.method = "next";
                context.arg = undefined;
              }
              return !!caught;
            }
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              var record = entry.completion;
              if (entry.tryLoc === "root") {
                return handle("end");
              }
              if (entry.tryLoc <= this.prev) {
                var hasCatch = hasOwn.call(entry, "catchLoc");
                var hasFinally = hasOwn.call(entry, "finallyLoc");
                if (hasCatch && hasFinally) {
                  if (this.prev < entry.catchLoc) {
                    return handle(entry.catchLoc, true);
                  } else if (this.prev < entry.finallyLoc) {
                    return handle(entry.finallyLoc);
                  }
                } else if (hasCatch) {
                  if (this.prev < entry.catchLoc) {
                    return handle(entry.catchLoc, true);
                  }
                } else if (hasFinally) {
                  if (this.prev < entry.finallyLoc) {
                    return handle(entry.finallyLoc);
                  }
                } else {
                  throw new Error("try statement without catch or finally");
                }
              }
            }
          },
          abrupt: function(type, arg) {
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
                var finallyEntry = entry;
                break;
              }
            }
            if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) {
              finallyEntry = null;
            }
            var record = finallyEntry ? finallyEntry.completion : {};
            record.type = type;
            record.arg = arg;
            if (finallyEntry) {
              this.method = "next";
              this.next = finallyEntry.finallyLoc;
              return ContinueSentinel;
            }
            return this.complete(record);
          },
          complete: function(record, afterLoc) {
            if (record.type === "throw") {
              throw record.arg;
            }
            if (record.type === "break" || record.type === "continue") {
              this.next = record.arg;
            } else if (record.type === "return") {
              this.rval = this.arg = record.arg;
              this.method = "return";
              this.next = "end";
            } else if (record.type === "normal" && afterLoc) {
              this.next = afterLoc;
            }
            return ContinueSentinel;
          },
          finish: function(finallyLoc) {
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              if (entry.finallyLoc === finallyLoc) {
                this.complete(entry.completion, entry.afterLoc);
                resetTryEntry(entry);
                return ContinueSentinel;
              }
            }
          },
          "catch": function(tryLoc) {
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              if (entry.tryLoc === tryLoc) {
                var record = entry.completion;
                if (record.type === "throw") {
                  var thrown = record.arg;
                  resetTryEntry(entry);
                }
                return thrown;
              }
            }
            throw new Error("illegal catch attempt");
          },
          delegateYield: function(iterable, resultName, nextLoc) {
            this.delegate = {
              iterator: values(iterable),
              resultName,
              nextLoc
            };
            if (this.method === "next") {
              this.arg = undefined;
            }
            return ContinueSentinel;
          }
        };
        return exports2;
      }(
        // If this script is executing as a CommonJS module, use module.exports
        // as the regeneratorRuntime namespace. Otherwise create a new empty
        // object. Either way, the resulting object will be used to initialize
        // the regeneratorRuntime variable at the top of this file.
        typeof module === "object" ? module.exports : {}
      );
      try {
        regeneratorRuntime = runtime;
      } catch (accidentalStrictMode) {
        if (typeof globalThis === "object") {
          globalThis.regeneratorRuntime = runtime;
        } else {
          Function("r", "regeneratorRuntime = r")(runtime);
        }
      }
    }
  });

  // node_modules/tesseract.js/src/utils/getId.js
  var require_getId = __commonJS({
    "node_modules/tesseract.js/src/utils/getId.js"(exports, module) {
      module.exports = (prefix, cnt) => `${prefix}-${cnt}-${Math.random().toString(16).slice(3, 8)}`;
    }
  });

  // node_modules/tesseract.js/src/createJob.js
  var require_createJob = __commonJS({
    "node_modules/tesseract.js/src/createJob.js"(exports, module) {
      var getId = require_getId();
      var jobCounter = 0;
      module.exports = ({
        id: _id,
        action,
        payload = {}
      }) => {
        let id = _id;
        if (typeof id === "undefined") {
          id = getId("Job", jobCounter);
          jobCounter += 1;
        }
        return {
          id,
          action,
          payload
        };
      };
    }
  });

  // node_modules/tesseract.js/src/utils/log.js
  var require_log = __commonJS({
    "node_modules/tesseract.js/src/utils/log.js"(exports) {
      var logging = false;
      exports.logging = logging;
      exports.setLogging = (_logging) => {
        logging = _logging;
      };
      exports.log = (...args) => logging ? console.log.apply(exports, args) : null;
    }
  });

  // node_modules/tesseract.js/src/createScheduler.js
  var require_createScheduler = __commonJS({
    "node_modules/tesseract.js/src/createScheduler.js"(exports, module) {
      var createJob = require_createJob();
      var { log: log2 } = require_log();
      var getId = require_getId();
      var schedulerCounter = 0;
      module.exports = () => {
        const id = getId("Scheduler", schedulerCounter);
        const workers = {};
        const runningWorkers = {};
        let jobQueue = [];
        schedulerCounter += 1;
        const getQueueLen = () => jobQueue.length;
        const getNumWorkers = () => Object.keys(workers).length;
        const dequeue = () => {
          if (jobQueue.length !== 0) {
            const wIds = Object.keys(workers);
            for (let i = 0; i < wIds.length; i += 1) {
              if (typeof runningWorkers[wIds[i]] === "undefined") {
                jobQueue[0](workers[wIds[i]]);
                break;
              }
            }
          }
        };
        const queue = (action, payload) => new Promise((resolve, reject) => {
          const job = createJob({ action, payload });
          jobQueue.push(async (w) => {
            jobQueue.shift();
            runningWorkers[w.id] = job;
            try {
              resolve(await w[action].apply(exports, [...payload, job.id]));
            } catch (err) {
              reject(err);
            } finally {
              delete runningWorkers[w.id];
              dequeue();
            }
          });
          log2(`[${id}]: Add ${job.id} to JobQueue`);
          log2(`[${id}]: JobQueue length=${jobQueue.length}`);
          dequeue();
        });
        const addWorker = (w) => {
          workers[w.id] = w;
          log2(`[${id}]: Add ${w.id}`);
          log2(`[${id}]: Number of workers=${getNumWorkers()}`);
          dequeue();
          return w.id;
        };
        const addJob = async (action, ...payload) => {
          if (getNumWorkers() === 0) {
            throw Error(`[${id}]: You need to have at least one worker before adding jobs`);
          }
          return queue(action, payload);
        };
        const terminate = async () => {
          Object.keys(workers).forEach(async (wid) => {
            await workers[wid].terminate();
          });
          jobQueue = [];
        };
        return {
          addWorker,
          addJob,
          terminate,
          getQueueLen,
          getNumWorkers
        };
      };
    }
  });

  // node_modules/is-electron/index.js
  var require_is_electron = __commonJS({
    "node_modules/is-electron/index.js"(exports, module) {
      function isElectron() {
        if (typeof window !== "undefined" && typeof window.process === "object" && window.process.type === "renderer") {
          return true;
        }
        if (typeof process !== "undefined" && typeof process.versions === "object" && !!process.versions.electron) {
          return true;
        }
        if (typeof navigator === "object" && typeof navigator.userAgent === "string" && navigator.userAgent.indexOf("Electron") >= 0) {
          return true;
        }
        return false;
      }
      module.exports = isElectron;
    }
  });

  // node_modules/tesseract.js/src/utils/getEnvironment.js
  var require_getEnvironment = __commonJS({
    "node_modules/tesseract.js/src/utils/getEnvironment.js"(exports, module) {
      var isElectron = require_is_electron();
      module.exports = (key) => {
        const env = {};
        if (typeof WorkerGlobalScope !== "undefined") {
          env.type = "webworker";
        } else if (isElectron()) {
          env.type = "electron";
        } else if (typeof window === "object") {
          env.type = "browser";
        } else if (typeof process === "object" && typeof __require === "function") {
          env.type = "node";
        }
        if (typeof key === "undefined") {
          return env;
        }
        return env[key];
      };
    }
  });

  // node_modules/resolve-url/resolve-url.js
  var require_resolve_url = __commonJS({
    "node_modules/resolve-url/resolve-url.js"(exports, module) {
      void function(root, factory) {
        if (typeof define === "function" && define.amd) {
          define(factory);
        } else if (typeof exports === "object") {
          module.exports = factory();
        } else {
          root.resolveUrl = factory();
        }
      }(exports, function() {
        function resolveUrl() {
          var numUrls = arguments.length;
          if (numUrls === 0) {
            throw new Error("resolveUrl requires at least one argument; got none.");
          }
          var base = document.createElement("base");
          base.href = arguments[0];
          if (numUrls === 1) {
            return base.href;
          }
          var head = document.getElementsByTagName("head")[0];
          head.insertBefore(base, head.firstChild);
          var a = document.createElement("a");
          var resolved;
          for (var index = 1; index < numUrls; index++) {
            a.href = arguments[index];
            resolved = a.href;
            base.href = resolved;
          }
          head.removeChild(base);
          return resolved;
        }
        return resolveUrl;
      });
    }
  });

  // node_modules/tesseract.js/src/utils/resolvePaths.js
  var require_resolvePaths = __commonJS({
    "node_modules/tesseract.js/src/utils/resolvePaths.js"(exports, module) {
      var isBrowser = require_getEnvironment()("type") === "browser";
      var resolveURL = isBrowser ? require_resolve_url() : (s) => s;
      module.exports = (options) => {
        const opts = { ...options };
        ["corePath", "workerPath", "langPath"].forEach((key) => {
          if (options[key]) {
            opts[key] = resolveURL(opts[key]);
          }
        });
        return opts;
      };
    }
  });

  // node_modules/tesseract.js/src/utils/circularize.js
  var require_circularize = __commonJS({
    "node_modules/tesseract.js/src/utils/circularize.js"(exports, module) {
      module.exports = (page) => {
        const blocks = [];
        const paragraphs = [];
        const lines = [];
        const words = [];
        const symbols = [];
        if (page.blocks) {
          page.blocks.forEach((block) => {
            block.paragraphs.forEach((paragraph) => {
              paragraph.lines.forEach((line) => {
                line.words.forEach((word) => {
                  word.symbols.forEach((sym) => {
                    symbols.push({
                      ...sym,
                      page,
                      block,
                      paragraph,
                      line,
                      word
                    });
                  });
                  words.push({
                    ...word,
                    page,
                    block,
                    paragraph,
                    line
                  });
                });
                lines.push({
                  ...line,
                  page,
                  block,
                  paragraph
                });
              });
              paragraphs.push({
                ...paragraph,
                page,
                block
              });
            });
            blocks.push({
              ...block,
              page
            });
          });
        }
        return {
          ...page,
          blocks,
          paragraphs,
          lines,
          words,
          symbols
        };
      };
    }
  });

  // node_modules/tesseract.js/src/constants/OEM.js
  var require_OEM = __commonJS({
    "node_modules/tesseract.js/src/constants/OEM.js"(exports, module) {
      module.exports = {
        TESSERACT_ONLY: 0,
        LSTM_ONLY: 1,
        TESSERACT_LSTM_COMBINED: 2,
        DEFAULT: 3
      };
    }
  });

  // node_modules/tesseract.js/src/constants/config.js
  var require_config = __commonJS({
    "node_modules/tesseract.js/src/constants/config.js"(exports, module) {
      var OEM = require_OEM();
      module.exports = {
        defaultOEM: OEM.DEFAULT
      };
    }
  });

  // node_modules/tesseract.js/package.json
  var require_package = __commonJS({
    "node_modules/tesseract.js/package.json"(exports, module) {
      module.exports = {
        name: "tesseract.js",
        version: "4.0.2",
        description: "Pure Javascript Multilingual OCR",
        main: "src/index.js",
        types: "src/index.d.ts",
        unpkg: "dist/tesseract.min.js",
        jsdelivr: "dist/tesseract.min.js",
        scripts: {
          start: "node scripts/server.js",
          build: "rimraf dist && webpack --config scripts/webpack.config.prod.js && rollup -c scripts/rollup.esm.js",
          "profile:tesseract": "webpack-bundle-analyzer dist/tesseract-stats.json",
          "profile:worker": "webpack-bundle-analyzer dist/worker-stats.json",
          prepublishOnly: "npm run build",
          wait: "rimraf dist && wait-on http://localhost:3000/dist/tesseract.dev.js",
          test: "npm-run-all -p -r start test:all",
          "test:all": "npm-run-all wait test:browser:* test:node:all",
          "test:node": "nyc mocha --exit --bail --require ./scripts/test-helper.js",
          "test:node:all": "npm run test:node -- ./tests/*.test.js",
          "test:browser-tpl": "mocha-headless-chrome -a incognito -a no-sandbox -a disable-setuid-sandbox -a disable-logging -t 300000",
          "test:browser:detect": "npm run test:browser-tpl -- -f ./tests/detect.test.html",
          "test:browser:recognize": "npm run test:browser-tpl -- -f ./tests/recognize.test.html",
          "test:browser:scheduler": "npm run test:browser-tpl -- -f ./tests/scheduler.test.html",
          "test:browser:FS": "npm run test:browser-tpl -- -f ./tests/FS.test.html",
          lint: "eslint src",
          "lint:fix": "eslint --fix src",
          postinstall: "opencollective-postinstall || true"
        },
        browser: {
          "./src/worker/node/index.js": "./src/worker/browser/index.js"
        },
        author: "",
        contributors: [
          "jeromewu"
        ],
        license: "Apache-2.0",
        devDependencies: {
          "@babel/core": "^7.18.7",
          "@babel/preset-env": "^7.18.7",
          "@rollup/plugin-commonjs": "^22.0.2",
          acorn: "^6.4.0",
          "babel-loader": "^8.2.0",
          buffer: "^6.0.3",
          cors: "^2.8.5",
          eslint: "^7.2.0",
          "eslint-config-airbnb-base": "^14.2.0",
          "eslint-plugin-import": "^2.22.1",
          "expect.js": "^0.3.1",
          express: "^4.17.1",
          mocha: "^10.0.0",
          "mocha-headless-chrome": "^4.0.0",
          "npm-run-all": "^4.1.5",
          nyc: "^15.1.0",
          rimraf: "^2.7.1",
          rollup: "^2.79.0",
          "wait-on": "^3.3.0",
          webpack: "^5.74.0",
          "webpack-bundle-analyzer": "^4.6.0",
          "webpack-cli": "^4.10.0",
          "webpack-dev-middleware": "^5.3.3"
        },
        dependencies: {
          "babel-eslint": "^10.1.0",
          "bmp-js": "^0.1.0",
          "file-type": "^12.4.1",
          "idb-keyval": "^3.2.0",
          "is-electron": "^2.2.0",
          "is-url": "^1.2.4",
          "node-fetch": "^2.6.0",
          "opencollective-postinstall": "^2.0.2",
          "regenerator-runtime": "^0.13.3",
          "resolve-url": "^0.2.1",
          "tesseract.js-core": "^4.0.2",
          "wasm-feature-detect": "^1.2.11",
          zlibjs: "^0.3.1"
        },
        repository: {
          type: "git",
          url: "https://github.com/naptha/tesseract.js.git"
        },
        bugs: {
          url: "https://github.com/naptha/tesseract.js/issues"
        },
        homepage: "https://github.com/naptha/tesseract.js",
        collective: {
          type: "opencollective",
          url: "https://opencollective.com/tesseractjs"
        }
      };
    }
  });

  // node_modules/tesseract.js/src/constants/defaultOptions.js
  var require_defaultOptions = __commonJS({
    "node_modules/tesseract.js/src/constants/defaultOptions.js"(exports, module) {
      module.exports = {
        /*
         * default path for downloading *.traineddata
         */
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        /*
         * Use BlobURL for worker script by default
         * TODO: remove this option
         *
         */
        workerBlobURL: true,
        logger: () => {
        }
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/defaultOptions.js
  var require_defaultOptions2 = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/defaultOptions.js"(exports, module) {
      var resolveURL = require_resolve_url();
      var { version } = require_package();
      var defaultOptions = require_defaultOptions();
      module.exports = {
        ...defaultOptions,
        workerPath: typeof process !== "undefined" && process.env.TESS_ENV === "development" ? resolveURL(`/dist/worker.dev.js?nocache=${Math.random().toString(36).slice(3)}`) : `https://unpkg.com/tesseract.js@v${version}/dist/worker.min.js`,
        /*
         * If browser doesn't support WebAssembly,
         * load ASM version instead
         */
        corePath: null
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/spawnWorker.js
  var require_spawnWorker = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/spawnWorker.js"(exports, module) {
      module.exports = ({ workerPath, workerBlobURL }) => {
        let worker;
        if (Blob && URL && workerBlobURL) {
          const blob = new Blob([`importScripts("${workerPath}");`], {
            type: "application/javascript"
          });
          worker = new Worker(URL.createObjectURL(blob));
        } else {
          worker = new Worker(workerPath);
        }
        return worker;
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/terminateWorker.js
  var require_terminateWorker = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/terminateWorker.js"(exports, module) {
      module.exports = (worker) => {
        worker.terminate();
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/onMessage.js
  var require_onMessage = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/onMessage.js"(exports, module) {
      module.exports = (worker, handler) => {
        worker.onmessage = ({ data }) => {
          handler(data);
        };
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/send.js
  var require_send = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/send.js"(exports, module) {
      module.exports = async (worker, packet) => {
        worker.postMessage(packet);
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/loadImage.js
  var require_loadImage = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/loadImage.js"(exports, module) {
      var resolveURL = require_resolve_url();
      var readFromBlobOrFile = (blob) => new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          resolve(fileReader.result);
        };
        fileReader.onerror = ({ target: { error: { code } } }) => {
          reject(Error(`File could not be read! Code=${code}`));
        };
        fileReader.readAsArrayBuffer(blob);
      });
      var loadImage2 = async (image) => {
        let data = image;
        if (typeof image === "undefined") {
          return "undefined";
        }
        if (typeof image === "string") {
          if (/data:image\/([a-zA-Z]*);base64,([^"]*)/.test(image)) {
            data = atob(image.split(",")[1]).split("").map((c) => c.charCodeAt(0));
          } else {
            const resp = await fetch(resolveURL(image));
            data = await resp.arrayBuffer();
          }
        } else if (image instanceof HTMLElement) {
          if (image.tagName === "IMG") {
            data = await loadImage2(image.src);
          }
          if (image.tagName === "VIDEO") {
            data = await loadImage2(image.poster);
          }
          if (image.tagName === "CANVAS") {
            await new Promise((resolve) => {
              image.toBlob(async (blob) => {
                data = await readFromBlobOrFile(blob);
                resolve();
              });
            });
          }
        } else if (image instanceof File || image instanceof Blob) {
          data = await readFromBlobOrFile(image);
        }
        return new Uint8Array(data);
      };
      module.exports = loadImage2;
    }
  });

  // node_modules/tesseract.js/src/worker/browser/index.js
  var require_browser = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/index.js"(exports, module) {
      var defaultOptions = require_defaultOptions2();
      var spawnWorker = require_spawnWorker();
      var terminateWorker = require_terminateWorker();
      var onMessage = require_onMessage();
      var send = require_send();
      var loadImage2 = require_loadImage();
      module.exports = {
        defaultOptions,
        spawnWorker,
        terminateWorker,
        onMessage,
        send,
        loadImage: loadImage2
      };
    }
  });

  // node_modules/tesseract.js/src/createWorker.js
  var require_createWorker = __commonJS({
    "node_modules/tesseract.js/src/createWorker.js"(exports, module) {
      var resolvePaths = require_resolvePaths();
      var circularize = require_circularize();
      var createJob = require_createJob();
      var { log: log2 } = require_log();
      var getId = require_getId();
      var { defaultOEM } = require_config();
      var {
        defaultOptions,
        spawnWorker,
        terminateWorker,
        onMessage,
        loadImage: loadImage2,
        send
      } = require_browser();
      var workerCounter = 0;
      module.exports = async (_options = {}) => {
        const id = getId("Worker", workerCounter);
        const {
          logger,
          errorHandler,
          ...options
        } = resolvePaths({
          ...defaultOptions,
          ..._options
        });
        const resolves = {};
        const rejects = {};
        let workerResReject;
        let workerResResolve;
        const workerRes = new Promise((resolve, reject) => {
          workerResResolve = resolve;
          workerResReject = reject;
        });
        const workerError = (event) => {
          workerResReject(event.message);
        };
        let worker = spawnWorker(options);
        worker.onerror = workerError;
        workerCounter += 1;
        const setResolve = (action, res) => {
          resolves[action] = res;
        };
        const setReject = (action, rej) => {
          rejects[action] = rej;
        };
        const startJob = ({ id: jobId, action, payload }) => new Promise((resolve, reject) => {
          log2(`[${id}]: Start ${jobId}, action=${action}`);
          setResolve(action, resolve);
          setReject(action, reject);
          send(worker, {
            workerId: id,
            jobId,
            action,
            payload
          });
        });
        const load = () => console.warn("`load` is depreciated and should be removed from code (workers now come pre-loaded)");
        const loadInternal = (jobId) => startJob(createJob({
          id: jobId,
          action: "load",
          payload: { options }
        }));
        const writeText = (path, text, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method: "writeFile", args: [path, text] }
        }));
        const readText = (path, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method: "readFile", args: [path, { encoding: "utf8" }] }
        }));
        const removeFile = (path, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method: "unlink", args: [path] }
        }));
        const FS = (method, args, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method, args }
        }));
        const loadLanguage = (langs = "eng", jobId) => startJob(createJob({
          id: jobId,
          action: "loadLanguage",
          payload: { langs, options }
        }));
        const initialize = (langs = "eng", oem = defaultOEM, config, jobId) => startJob(createJob({
          id: jobId,
          action: "initialize",
          payload: { langs, oem, config }
        }));
        const setParameters = (params = {}, jobId) => startJob(createJob({
          id: jobId,
          action: "setParameters",
          payload: { params }
        }));
        const recognize = async (image, opts = {}, output = {
          blocks: true,
          text: true,
          hocr: true,
          tsv: true
        }, jobId) => startJob(createJob({
          id: jobId,
          action: "recognize",
          payload: { image: await loadImage2(image), options: opts, output }
        }));
        const getPDF = (title = "Tesseract OCR Result", textonly = false, jobId) => {
          console.log("`getPDF` function is depreciated. `recognize` option `savePDF` should be used instead.");
          return startJob(createJob({
            id: jobId,
            action: "getPDF",
            payload: { title, textonly }
          }));
        };
        const detect = async (image, jobId) => startJob(createJob({
          id: jobId,
          action: "detect",
          payload: { image: await loadImage2(image) }
        }));
        const terminate = async () => {
          if (worker !== null) {
            terminateWorker(worker);
            worker = null;
          }
          return Promise.resolve();
        };
        onMessage(worker, ({
          workerId,
          jobId,
          status,
          action,
          data
        }) => {
          if (status === "resolve") {
            log2(`[${workerId}]: Complete ${jobId}`);
            let d = data;
            if (action === "recognize") {
              d = circularize(data);
            } else if (action === "getPDF") {
              d = Array.from({ ...data, length: Object.keys(data).length });
            }
            resolves[action]({ jobId, data: d });
          } else if (status === "reject") {
            rejects[action](data);
            if (action === "load")
              workerResReject(data);
            if (errorHandler) {
              errorHandler(data);
            } else {
              throw Error(data);
            }
          } else if (status === "progress") {
            logger({ ...data, userJobId: jobId });
          }
        });
        const resolveObj = {
          id,
          worker,
          setResolve,
          setReject,
          load,
          writeText,
          readText,
          removeFile,
          FS,
          loadLanguage,
          initialize,
          setParameters,
          recognize,
          getPDF,
          detect,
          terminate
        };
        loadInternal().then(() => workerResResolve(resolveObj)).catch(() => {
        });
        return workerRes;
      };
    }
  });

  // node_modules/tesseract.js/src/Tesseract.js
  var require_Tesseract = __commonJS({
    "node_modules/tesseract.js/src/Tesseract.js"(exports, module) {
      var createWorker2 = require_createWorker();
      var recognize = async (image, langs, options) => {
        const worker = await createWorker2(options);
        await worker.loadLanguage(langs);
        await worker.initialize(langs);
        return worker.recognize(image).finally(async () => {
          await worker.terminate();
        });
      };
      var detect = async (image, options) => {
        const worker = await createWorker2(options);
        await worker.loadLanguage("osd");
        await worker.initialize("osd");
        return worker.detect(image).finally(async () => {
          await worker.terminate();
        });
      };
      module.exports = {
        recognize,
        detect
      };
    }
  });

  // node_modules/tesseract.js/src/constants/languages.js
  var require_languages = __commonJS({
    "node_modules/tesseract.js/src/constants/languages.js"(exports, module) {
      module.exports = {
        AFR: "afr",
        AMH: "amh",
        ARA: "ara",
        ASM: "asm",
        AZE: "aze",
        AZE_CYRL: "aze_cyrl",
        BEL: "bel",
        BEN: "ben",
        BOD: "bod",
        BOS: "bos",
        BUL: "bul",
        CAT: "cat",
        CEB: "ceb",
        CES: "ces",
        CHI_SIM: "chi_sim",
        CHI_TRA: "chi_tra",
        CHR: "chr",
        CYM: "cym",
        DAN: "dan",
        DEU: "deu",
        DZO: "dzo",
        ELL: "ell",
        ENG: "eng",
        ENM: "enm",
        EPO: "epo",
        EST: "est",
        EUS: "eus",
        FAS: "fas",
        FIN: "fin",
        FRA: "fra",
        FRK: "frk",
        FRM: "frm",
        GLE: "gle",
        GLG: "glg",
        GRC: "grc",
        GUJ: "guj",
        HAT: "hat",
        HEB: "heb",
        HIN: "hin",
        HRV: "hrv",
        HUN: "hun",
        IKU: "iku",
        IND: "ind",
        ISL: "isl",
        ITA: "ita",
        ITA_OLD: "ita_old",
        JAV: "jav",
        JPN: "jpn",
        KAN: "kan",
        KAT: "kat",
        KAT_OLD: "kat_old",
        KAZ: "kaz",
        KHM: "khm",
        KIR: "kir",
        KOR: "kor",
        KUR: "kur",
        LAO: "lao",
        LAT: "lat",
        LAV: "lav",
        LIT: "lit",
        MAL: "mal",
        MAR: "mar",
        MKD: "mkd",
        MLT: "mlt",
        MSA: "msa",
        MYA: "mya",
        NEP: "nep",
        NLD: "nld",
        NOR: "nor",
        ORI: "ori",
        PAN: "pan",
        POL: "pol",
        POR: "por",
        PUS: "pus",
        RON: "ron",
        RUS: "rus",
        SAN: "san",
        SIN: "sin",
        SLK: "slk",
        SLV: "slv",
        SPA: "spa",
        SPA_OLD: "spa_old",
        SQI: "sqi",
        SRP: "srp",
        SRP_LATN: "srp_latn",
        SWA: "swa",
        SWE: "swe",
        SYR: "syr",
        TAM: "tam",
        TEL: "tel",
        TGK: "tgk",
        TGL: "tgl",
        THA: "tha",
        TIR: "tir",
        TUR: "tur",
        UIG: "uig",
        UKR: "ukr",
        URD: "urd",
        UZB: "uzb",
        UZB_CYRL: "uzb_cyrl",
        VIE: "vie",
        YID: "yid"
      };
    }
  });

  // node_modules/tesseract.js/src/constants/PSM.js
  var require_PSM = __commonJS({
    "node_modules/tesseract.js/src/constants/PSM.js"(exports, module) {
      module.exports = {
        OSD_ONLY: "0",
        AUTO_OSD: "1",
        AUTO_ONLY: "2",
        AUTO: "3",
        SINGLE_COLUMN: "4",
        SINGLE_BLOCK_VERT_TEXT: "5",
        SINGLE_BLOCK: "6",
        SINGLE_LINE: "7",
        SINGLE_WORD: "8",
        CIRCLE_WORD: "9",
        SINGLE_CHAR: "10",
        SPARSE_TEXT: "11",
        SPARSE_TEXT_OSD: "12",
        RAW_LINE: "13"
      };
    }
  });

  // node_modules/tesseract.js/src/index.js
  var require_src = __commonJS({
    "node_modules/tesseract.js/src/index.js"(exports, module) {
      require_runtime();
      var createScheduler = require_createScheduler();
      var createWorker2 = require_createWorker();
      var Tesseract = require_Tesseract();
      var languages = require_languages();
      var OEM = require_OEM();
      var PSM = require_PSM();
      var { setLogging } = require_log();
      module.exports = {
        languages,
        OEM,
        PSM,
        createScheduler,
        createWorker: createWorker2,
        setLogging,
        ...Tesseract
      };
    }
  });

  // ===================================================================
  // Auto Horn & KR Solver logic (rewritten; the Tesseract.js bundle above is unchanged)
  // ===================================================================
  var import_tesseract = __toESM(require_src());

  const SCRIPT = 'MH Auto Horn';
  const CFG_KEY = 'mh_auto_horn_kane_v1';
  const OLD_CFG_KEY = 'mh_auto_horn_cfg_v1';  // settings from the Greasy Fork version, imported once
  const TICK_MS = 1000;
  const HORN_PRESS_MS = 500;           // mousedown -> mouseup, like a real click
  const HORN_CONFIRM_MS = 10000;       // the horn must stop being ready within this long
  const HORN_FAILS_BEFORE_RELOAD = 3;
  const BUSY_DEFER_MAX_MS = 120000;    // wait at most this long for the Skyport script to finish an action
  const KR_CODE_LENGTH = 5;
  const KR_PRE_SUBMIT_MS = 1000;     // between typing the code and pressing Submit
  const KR_VERIFY_MS = 3000;         // wait after Submit before checking the result
  const KR_NEW_CODE_MS = 5000;       // wait for a new code image after asking for one
  const KR_RELOAD_KEY = 'mhah_kr_reloaded';   // sessionStorage: already reloaded once for this KR
  const HORN_INTERVAL_MS = 15 * 60000;

  const SEL = {
    hornReady: '.huntersHornView__horn--reveal',
    hornMessage: '.huntersHornView__message',
    hornCountdown: '.huntersHornView__timerState--type-countdown',
    puzzleActive: '.puzzleView--active',
    puzzleImage: '.puzzleView__image > img',
    puzzleCode: '.puzzleView__code',
    puzzleSubmit: '.puzzleView__solveButton',
    puzzleResume: '.puzzleView__resumeButton',
    puzzleNewCode: '.puzzleView__requestNewPuzzleButton',
    puzzleSolved: '.puzzleView__formState--solved, .puzzleView__formState--alreadySolved',
  };

  /* ---------------- Config ---------------- */
  const DEFAULTS = {
    hornDelayMin: 10,        // sec, random extra wait after the horn is ready
    hornDelayMax: 180,       // sec
    krRetryLimit: 3,         // OCR attempts per King's Reward before handing over to you
    watchdogMin: 5,          // reload if no horn goes off for 15 min + max delay + this
  };
  const FIELDS = [
    ['hornDelayMin', 'Horn delay min (sec)', 0, 600, 'Shortest random wait after the horn becomes ready.'],
    ['hornDelayMax', 'Horn delay max (sec)', 0, 600, 'Longest random wait after the horn becomes ready. The wait is picked evenly between min and max.'],
    ['krRetryLimit', 'KR attempts', 1, 10, "Reading attempts per King's Reward. If they all fail, the page reloads once and tries again; after that the script flags the tab title and waits for you to solve it."],
    ['watchdogMin', 'Watchdog (min)', 1, 60, 'Reload the page if no horn has gone off for 15 min + max delay + this many minutes (e.g. the game stopped updating).'],
  ];

  function loadConfig() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { /* ignore */ }
    if (!stored) {
      try {
        const old = JSON.parse(localStorage.getItem(OLD_CFG_KEY) || 'null');
        if (old) {
          stored = {};
          for (const k of Object.keys(DEFAULTS)) if (k in old) stored[k] = old[k];
        }
      } catch (e) { /* ignore */ }
    }
    return Object.assign({}, DEFAULTS, stored || {});
  }
  const cfg = loadConfig();
  function saveConfig() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------------- Helpers ---------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $1 = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  function log(msg) { console.log(`[${SCRIPT}] ${clock(new Date())} ${msg}`); }

  function randomHornDelayMs() {
    const lo = Math.max(0, Number(cfg.hornDelayMin) || 0);
    const hi = Math.max(lo, Number(cfg.hornDelayMax) || 0);
    return (lo + Math.random() * (hi - lo)) * 1000;
  }

  // "+ 10–180s random delay", following the Settings values.
  function delayText() {
    const lo = Math.max(0, Number(cfg.hornDelayMin) || 0);
    const hi = Math.max(lo, Number(cfg.hornDelayMax) || 0);
    if (hi === 0) return 'no extra delay';
    if (lo === hi) return `+ ${lo}s delay`;
    return `+ ${lo}–${hi}s random delay`;
  }

  function hasPuzzle() {
    return Boolean(window.user && window.user.has_puzzle) || !!$1(SEL.puzzleActive);
  }

  // The Cerulean Skyport Autopilot exposes busy() while it launches, crafts or swaps the trap.
  function skyportBusy() {
    try { return !!(window.mhSkyport && window.mhSkyport.busy && window.mhSkyport.busy()); } catch (e) { return false; }
  }

  function countdownText() {
    const el = $1(SEL.hornCountdown);
    return el ? el.textContent.trim() : '';
  }

  /* ---------------- State ---------------- */
  const st = {
    hornAt: 0,            // when to sound the horn (0 = horn not ready / not scheduled)
    wasReady: false,
    lastProgress: Date.now(),   // last time a horn went off (by anyone) or a KR cleared
    hornFails: 0,
    busyWaitSince: 0,
    krBusy: false,
    krGaveUp: false,
    status: { kind: 'idle', lead: 'Starting…', detail: '' },
    stopped: false,
  };
  const baseTitle = document.title;

  /* ---------------- Reload (only when the Skyport script is idle) ---------------- */
  let reloading = false;
  async function safeReload(reason) {
    if (reloading) return;
    reloading = true;
    log(`Reloading: ${reason}`);
    const start = Date.now();
    while (skyportBusy() && Date.now() - start < BUSY_DEFER_MAX_MS) {
      setStatus('ready', 'Reload pending', `${reason}, waiting for Skyport script`);
      await sleep(2000);
    }
    window.location.reload();
  }

  /* ---------------- Horn ---------------- */
  async function soundHorn() {
    const horn = $1(SEL.hornReady);
    if (!horn) return;
    log('Sounding horn');
    horn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(HORN_PRESS_MS);
    horn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    const deadline = Date.now() + HORN_CONFIRM_MS;
    while (Date.now() < deadline) {
      await sleep(500);
      if (!$1(SEL.hornReady) || hasPuzzle()) break;
    }
    const msgEl = $1(SEL.hornMessage);
    const msg = msgEl ? msgEl.textContent.trim() : '';
    if (msg) log(`Horn message: ${msg}`);

    if ($1(SEL.hornReady) && !hasPuzzle()) {
      st.hornFails++;
      log(`Horn did not go through (${st.hornFails}/${HORN_FAILS_BEFORE_RELOAD})`);
      if (st.hornFails >= HORN_FAILS_BEFORE_RELOAD) await safeReload('horn keeps failing');
      st.hornAt = Date.now() + 15000;   // retry shortly
    } else {
      st.hornFails = 0;
      st.hornAt = 0;
      log('Horn sounded');
    }
  }

  /* ---------------- King's Reward ---------------- */
  let ocrWorker = null;

  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    const w = await (0, import_tesseract.createWorker)();
    await w.loadLanguage('eng');
    await w.initialize('eng');
    await w.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      tessedit_pageseg_mode: import_tesseract.PSM.SINGLE_LINE,
    });
    ocrWorker = w;
    return w;
  }

  async function releaseOcrWorker() {
    const w = ocrWorker;
    ocrWorker = null;
    if (w) { try { await w.terminate(); } catch (e) { /* already gone */ } }
  }

  async function waitForImage(img) {
    if (img.complete && img.naturalWidth) return;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('captcha image timed out')), 15000);
      img.addEventListener('load', () => { clearTimeout(t); resolve(); }, { once: true });
      img.addEventListener('error', () => { clearTimeout(t); reject(new Error('captcha image failed to load')); }, { once: true });
    });
  }

  // Draw the captcha already on the page (no second download), scaled up 2x in greyscale.
  function captchaCanvas(img) {
    const scale = 2;
    const w = img.naturalWidth || 200;
    const h = img.naturalHeight || 58;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  async function requestNewCode() {
    const link = $1(SEL.puzzleNewCode);
    if (link) link.click();
    await sleep(KR_NEW_CODE_MS);
  }

  function krSolved() {
    return (window.user && window.user.has_puzzle === false) || !!$1(SEL.puzzleSolved) || !!$1(SEL.puzzleResume);
  }

  // One attempt: read the code, submit it, report whether it was accepted.
  async function attemptKR() {
    const img = $1(SEL.puzzleImage);
    if (!img) throw new Error('captcha image not found');
    await waitForImage(img);
    const shownSrc = img.src;
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(captchaCanvas(img));
    const code = (data.text || '').replace(/[^A-Za-z0-9]/g, '');
    if (code.length !== KR_CODE_LENGTH) {
      log(`OCR read "${code}" — not ${KR_CODE_LENGTH} characters, asking for a new code`);
      await requestNewCode();
      return false;
    }
    log(`OCR read ${code}, submitting`);
    const input = $1(SEL.puzzleCode);
    if (!input) throw new Error('code input not found');
    input.value = code;
    input.dispatchEvent(new KeyboardEvent('keyup'));
    await sleep(KR_PRE_SUBMIT_MS);
    const submit = $1(SEL.puzzleSubmit);
    if (!submit) throw new Error('submit button not found');
    submit.click();
    await sleep(KR_VERIFY_MS);
    if (krSolved()) {
      const resume = $1(SEL.puzzleResume);
      if (resume) resume.click();
      return true;
    }
    // Rejected. Ask for a new code unless the game already put up a new image, so the next attempt
    // doesn't re-read the same captcha.
    const now = $1(SEL.puzzleImage);
    if (hasPuzzle() && (!now || now.src === shownSrc)) {
      log('Code rejected, asking for a new code');
      await requestNewCode();
    }
    return false;
  }

  function krReloaded() {
    try { return sessionStorage.getItem(KR_RELOAD_KEY) === '1'; } catch (e) { return true; }
  }
  function setKrReloaded(on) {
    try { if (on) sessionStorage.setItem(KR_RELOAD_KEY, '1'); else sessionStorage.removeItem(KR_RELOAD_KEY); } catch (e) { /* ignore */ }
  }

  async function solveKR() {
    st.krBusy = true;
    try {
      for (let i = 0; i < cfg.krRetryLimit; i++) {
        setStatus('ready', "Solving King's Reward", `attempt ${i + 1}/${cfg.krRetryLimit}`);
        let ok = false;
        try { ok = await attemptKR(); } catch (e) { log(`KR attempt error: ${e.message || e}`); }
        if (ok) {
          log("King's Reward solved");
          setKrReloaded(false);
          await releaseOcrWorker();
          await safeReload('King\'s Reward solved');
          return;
        }
        if (!hasPuzzle()) { await releaseOcrWorker(); return; }   // solved some other way
      }
      await releaseOcrWorker();
      if (!krReloaded()) {
        setKrReloaded(true);
        await safeReload(`King's Reward not solved after ${cfg.krRetryLimit} attempts, trying a fresh page`);
        return;
      }
      st.krGaveUp = true;
      log(`King's Reward still not solved after a reload — waiting for you`);
    } finally {
      await releaseOcrWorker();
      st.krBusy = false;
    }
  }

  /* ---------------- Main tick (never dies) ---------------- */
  async function tick() {
    const now = Date.now();
    if (hasPuzzle()) {
      st.hornAt = 0;
      st.lastProgress = now;
      if (st.krGaveUp) {
        setStatus('err', "King's Reward needs you", 'solve it and the script carries on');
        document.title = `⚠ KR — ${baseTitle}`;
      } else if (!st.krBusy) {
        await solveKR();
      }
      return;
    }
    // Clear the one-reload mark only once the game itself says there is no KR (not while it is still loading).
    if (window.user && window.user.has_puzzle === false && krReloaded()) setKrReloaded(false);
    if (st.krGaveUp) {           // you solved it by hand
      st.krGaveUp = false;
      document.title = baseTitle;
      log("King's Reward cleared");
    }

    const ready = !!$1(SEL.hornReady);
    if (st.wasReady && !ready) st.lastProgress = now;   // a horn went off
    st.wasReady = ready;

    if (now - st.lastProgress > HORN_INTERVAL_MS + cfg.hornDelayMax * 1000 + cfg.watchdogMin * 60000) {
      await safeReload('no horn for too long');
      return;
    }

    if (!ready) {
      st.hornAt = 0;
      st.busyWaitSince = 0;
      const cd = countdownText();
      setStatus('idle', cd ? `Horn in ${cd}` : 'Waiting for horn', delayText());
      return;
    }

    if (!st.hornAt) {
      st.hornAt = now + randomHornDelayMs();
      log(`Horn ready, sounding at ${clock(new Date(st.hornAt))}`);
    }

    if (now < st.hornAt) {
      setStatus('ready', 'Horn ready', `sounding at ${clock(new Date(st.hornAt))} (${Math.ceil((st.hornAt - now) / 1000)}s)`);
      return;
    }

    if (skyportBusy()) {
      if (!st.busyWaitSince) st.busyWaitSince = now;
      if (now - st.busyWaitSince < BUSY_DEFER_MAX_MS) {
        setStatus('ready', 'Horn ready', 'waiting for Skyport script to finish');
        return;
      }
    }
    st.busyWaitSince = 0;
    setStatus('ready', 'Sounding horn…');
    await soundHorn();
  }

  let errorStreak = 0;
  async function loop() {
    try {
      await tick();
      errorStreak = 0;
    } catch (e) {
      errorStreak++;
      log(`tick error: ${(e && e.message) || e}`);
      setStatus('err', 'Error', `${(e && e.message) || e}, retrying`);
      if (errorStreak >= 60) await safeReload('repeated errors');
    }
    setTimeout(loop, TICK_MS);
  }

  /* ---------------- UI ---------------- */
  const UI_ID = 'mhah-bar';
  const CSS = `
#${UI_ID}{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0;padding:6px 10px;
  background:#1b1f27;color:#e6e9ef;border:0;border-bottom:1px solid #3a4150;border-radius:0;
  font:12px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;}
#${UI_ID} .mhah-title{font-weight:600;color:#9ecbff;}
#${UI_ID} .mhah-dot{flex:none;width:8px;height:8px;border-radius:50%;background:#56d364;box-shadow:0 0 0 3px rgba(86,211,100,.15);}
#${UI_ID} .mhah-dot.mhah-ready{background:#e3b341;box-shadow:0 0 0 3px rgba(227,179,65,.15);}
#${UI_ID} .mhah-dot.mhah-err{background:#ff7b72;box-shadow:0 0 0 3px rgba(255,123,114,.18);}
#${UI_ID} .mhah-status{color:#aab2c0;}
#${UI_ID} .mhah-status b{color:#e6e9ef;font-weight:600;}
#${UI_ID} .mhah-status.mhah-err,#${UI_ID} .mhah-status.mhah-err b{color:#ff7b72;}
#${UI_ID} .mhah-toggle{margin-left:auto;background:none;border:0;padding:0;color:#8b93a3;cursor:pointer;font:inherit;text-decoration:none;}
#${UI_ID} .mhah-toggle:hover{color:#e6e9ef;}
#${UI_ID} .mhah-settings{width:100%;border-top:1px solid #303747;padding-top:5px;}
#${UI_ID} .mhah-settings[hidden]{display:none;}
#${UI_ID} .mhah-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:3px 18px;margin-top:6px;}
#${UI_ID} label{display:flex;justify-content:space-between;align-items:center;gap:8px;color:#e6e9ef;}
#${UI_ID} input{width:78px;box-sizing:border-box;text-align:left;background:#11151b;color:#e6e9ef;border:1px solid #3a4150;border-radius:4px;padding:3px 4px 3px 8px;font:inherit;font-weight:600;color-scheme:dark;}
#${UI_ID} input:focus{border-color:#58a6ff;outline:none;}
#${UI_ID} .mhah-reset{margin-top:6px;background:none;border:0;color:#9ecbff;cursor:pointer;padding:2px 0;font-size:11px;text-decoration:underline;}
#${UI_ID} .mhah-tip{position:absolute;z-index:3;display:none;pointer-events:none;max-width:300px;background:#0d1117;color:#e6e9ef;
  border:1px solid #3a4150;border-radius:6px;padding:6px 8px;font-size:11px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,.5);}
`;

  let statusEl = null;
  let dotEl = null;
  // kind: 'idle' (green dot), 'ready' (amber), 'err' (red). Shown as "<b>lead</b> · detail".
  function setStatus(kind, lead, detail) {
    st.status = { kind, lead, detail: detail || '' };
    if (!statusEl) return;
    statusEl.textContent = '';
    const b = document.createElement('b');
    b.textContent = lead;
    statusEl.appendChild(b);
    if (detail) statusEl.appendChild(document.createTextNode(` · ${detail}`));
    statusEl.classList.toggle('mhah-err', kind === 'err');
    dotEl.classList.toggle('mhah-ready', kind === 'ready');
    dotEl.classList.toggle('mhah-err', kind === 'err');
  }

  // Hover tooltips for [data-tip] rows, kept inside the bar: below the row if it fits, else above,
  // else pinned to the bar's bottom edge; never past the bar's right edge.
  function initTooltips(box) {
    const tip = document.createElement('div');
    tip.className = 'mhah-tip';
    box.appendChild(tip);
    let timer = null;
    const hide = () => { clearTimeout(timer); tip.style.display = 'none'; };
    box.addEventListener('mouseover', (e) => {
      const row = e.target.closest('[data-tip]');
      if (!row || row.contains(e.relatedTarget)) return;
      hide();
      timer = setTimeout(() => {
        tip.textContent = row.dataset.tip;
        tip.style.display = 'block';
        const b = box.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        tip.style.maxWidth = `${Math.min(300, b.width - 16)}px`;
        const left = Math.min(r.left - b.left, b.width - tip.offsetWidth - 8);
        tip.style.left = `${Math.max(8, left)}px`;
        const h = tip.offsetHeight;
        const below = r.bottom - b.top + 4;
        const above = r.top - b.top - h - 4;
        tip.style.top = `${below + h <= b.height - 4 ? below : above >= 4 ? above : Math.max(4, b.height - h - 4)}px`;
      }, 350);
    });
    box.addEventListener('mouseout', (e) => {
      const row = e.target.closest('[data-tip]');
      if (row && !row.contains(e.relatedTarget)) hide();
    });
  }

  // Stretch the bar over the game frame's padding and the gap before the next element, so none of the
  // frame's brown background shows around it.
  function fillHostEdges(bar, host) {
    const hs = getComputedStyle(host);
    const pad = (k) => parseFloat(hs[k]) || 0;
    bar.style.marginTop = `${-pad('paddingTop')}px`;
    bar.style.marginLeft = `${-pad('paddingLeft')}px`;
    bar.style.marginRight = `${-pad('paddingRight')}px`;
    let next = bar.nextElementSibling;
    while (next && !next.getClientRects().length) next = next.nextElementSibling;   // skip hidden elements
    if (next) {
      const gap = next.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
      if (gap > 0) bar.style.marginBottom = `${-gap}px`;
    }
  }

  function buildUI() {
    const host = document.getElementById('mousehuntContainer');
    if (!host || document.getElementById(UI_ID)) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = UI_ID;
    bar.innerHTML = `<span class="mhah-title">Auto Horn</span><span class="mhah-dot"></span><span class="mhah-status"></span>
<button class="mhah-toggle" type="button"></button>
<div class="mhah-settings" hidden><div class="mhah-grid"></div><button class="mhah-reset" type="button">Reset to defaults</button></div>`;
    statusEl = bar.querySelector('.mhah-status');
    dotEl = bar.querySelector('.mhah-dot');
    const grid = bar.querySelector('.mhah-grid');
    const inputs = {};
    for (const [key, label, min, max, tip] of FIELDS) {
      const row = document.createElement('label');
      row.dataset.tip = tip;
      row.textContent = label;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = min;
      input.max = max;
      input.value = cfg[key];
      input.addEventListener('change', () => {
        let v = parseInt(input.value, 10);
        if (isNaN(v)) v = DEFAULTS[key];
        v = Math.max(min, Math.min(max, v));
        cfg[key] = v;
        input.value = v;
        if (key === 'hornDelayMin' || key === 'hornDelayMax') st.hornAt = 0;   // re-roll with the new range
        saveConfig();
      });
      inputs[key] = input;
      row.appendChild(input);
      grid.appendChild(row);
    }
    // The Settings button stays put at the right of the status row; the inputs open on a row below.
    const toggle = bar.querySelector('.mhah-toggle');
    const settings = bar.querySelector('.mhah-settings');
    const showSettings = (open) => {
      settings.hidden = !open;
      toggle.textContent = open ? '▾ Settings' : '▸ Settings';
    };
    showSettings(false);
    toggle.addEventListener('click', () => showSettings(settings.hidden));
    bar.querySelector('.mhah-reset').addEventListener('click', () => {
      Object.assign(cfg, DEFAULTS);
      saveConfig();
      for (const [key] of FIELDS) inputs[key].value = cfg[key];
      st.hornAt = 0;
    });
    host.insertBefore(bar, host.firstChild);
    fillHostEdges(bar, host);
    initTooltips(bar);
    setStatus(st.status.kind, st.status.lead, st.status.detail);
  }

  buildUI();
  window.mhAutoHorn = { state: () => Object.assign({}, st), config: cfg };
  log('Loaded');
  loop();
})();
