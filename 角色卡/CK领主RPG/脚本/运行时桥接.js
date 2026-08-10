;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
var _a;
/** A special constant with type `never` */
const NEVER = /*@__PURE__*/ (/* unused pure expression or super */ null && (Object.freeze({
    status: "aborted",
})));
function $constructor(name, initializer, params) {
    function init(inst, def) {
        if (!inst._zod) {
            Object.defineProperty(inst, "_zod", {
                value: {
                    def,
                    constr: _,
                    traits: new Set(),
                },
                enumerable: false,
            });
        }
        if (inst._zod.traits.has(name)) {
            return;
        }
        inst._zod.traits.add(name);
        initializer(inst, def);
        // support prototype modifications
        const proto = _.prototype;
        const keys = Object.keys(proto);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!(k in inst)) {
                inst[k] = proto[k].bind(inst);
            }
        }
    }
    // doesn't work if Parent has a constructor with arguments
    const Parent = params?.Parent ?? Object;
    class Definition extends Parent {
    }
    Object.defineProperty(Definition, "name", { value: name });
    function _(def) {
        var _a;
        const inst = params?.Parent ? new Definition() : this;
        init(inst, def);
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        for (const fn of inst._zod.deferred) {
            fn();
        }
        return inst;
    }
    Object.defineProperty(_, "init", { value: init });
    Object.defineProperty(_, Symbol.hasInstance, {
        value: (inst) => {
            if (params?.Parent && inst instanceof params.Parent)
                return true;
            return inst?._zod?.traits?.has(name);
        },
    });
    Object.defineProperty(_, "name", { value: name });
    return _;
}
//////////////////////////////   UTILITIES   ///////////////////////////////////////
const $brand = Symbol("zod_brand");
class $ZodAsyncError extends Error {
    constructor() {
        super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
}
class $ZodEncodeError extends Error {
    constructor(name) {
        super(`Encountered unidirectional transform during encode: ${name}`);
        this.name = "ZodEncodeError";
    }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
const globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
    if (newConfig)
        Object.assign(globalConfig, newConfig);
    return globalConfig;
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
/* unused harmony import specifier */ var util;

/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link cuid2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const cuid = /^[cC][0-9a-z]{6,}$/;
const cuid2 = /^[0-9a-z]+$/;
const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
const xid = /^[0-9a-vA-V]{20}$/;
const ksuid = /^[A-Za-z0-9]{27}$/;
const nanoid = /^[a-zA-Z0-9_-]{21}$/;
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** Implements ISO 8601-2 extensions like explicit +- prefixes, mixing weeks with other units, and fractional/negative components. */
const extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
 *
 * @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
const uuid = (version) => {
    if (!version)
        return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
    return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
const uuid4 = /*@__PURE__*/ (/* unused pure expression or super */ null && (uuid(4)));
const uuid6 = /*@__PURE__*/ (/* unused pure expression or super */ null && (uuid(6)));
const uuid7 = /*@__PURE__*/ (/* unused pure expression or super */ null && (uuid(7)));
/** Practical email validation */
const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
/** Equivalent to the HTML5 input[type=email] validation implemented by browsers. Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email */
const html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
/** The classic emailregex.com regex for RFC 5322-compliant emails */
const rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
/** A loose regex that allows Unicode characters, enforces length limits, and that's about it. */
const unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
const idnEmail = (/* unused pure expression or super */ null && (unicodeEmail));
const browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
// from https://thekevinscott.com/emojis-in-javascript/#writing-a-regular-expression
const _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
    return new RegExp(_emoji, "u");
}
const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
const mac = (delimiter) => {
    const escapedDelim = util.escapeRegex(delimiter ?? ":");
    return new RegExp(`^(?:[0-9A-F]{2}${escapedDelim}){5}[0-9A-F]{2}$|^(?:[0-9a-f]{2}${escapedDelim}){5}[0-9a-f]{2}$`);
};
const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
// https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
const base64url = /^[A-Za-z0-9_-]*$/;
// based on https://stackoverflow.com/questions/106179/regular-expression-to-match-dns-hostname-or-ip-address
// export const hostname: RegExp = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
const hostname = /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$/;
const domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const httpProtocol = /^https?$/;
// https://blog.stevenlevithan.com/archives/validate-phone-number#r4-3 (regex sans spaces)
// E.164: leading digit must be 1-9; total digits (excluding '+') between 7-15
const e164 = /^\+[1-9]\d{6,14}$/;
// const dateSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
const date = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
function timeSource(args) {
    const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
    const regex = typeof args.precision === "number"
        ? args.precision === -1
            ? `${hhmm}`
            : args.precision === 0
                ? `${hhmm}:[0-5]\\d`
                : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}`
        : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    return regex;
}
function time(args) {
    return new RegExp(`^${timeSource(args)}$`);
}
// Adapted from https://stackoverflow.com/a/3143231
function datetime(args) {
    const time = timeSource({ precision: args.precision });
    const opts = ["Z"];
    if (args.local)
        opts.push("");
    // if (args.offset) opts.push(`([+-]\\d{2}:\\d{2})`);
    if (args.offset)
        opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
    const timeRegex = `${time}(?:${opts.join("|")})`;
    return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
const string = (params) => {
    const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
    return new RegExp(`^${regex}$`);
};
const bigint = /^-?\d+n?$/;
const integer = /^-?\d+$/;
const number = /^-?\d+(?:\.\d+)?$/;
const regexes_boolean = /^(?:true|false)$/i;
const _null = /^null$/i;

const _undefined = /^undefined$/i;

// regex for string with no uppercase letters
const lowercase = /^[^A-Z]*$/;
// regex for string with no lowercase letters
const uppercase = /^[^a-z]*$/;
// regex for hexadecimal strings (any length)
const hex = /^[0-9a-fA-F]*$/;
// Hash regexes for different algorithms and encodings
// Helper function to create base64 regex with exact length and padding
function fixedBase64(bodyLength, padding) {
    return new RegExp(`^[A-Za-z0-9+/]{${bodyLength}}${padding}$`);
}
// Helper function to create base64url regex with exact length (no padding)
function fixedBase64url(length) {
    return new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
}
// MD5 (16 bytes): base64 = 24 chars total (22 + "==")
const md5_hex = /^[0-9a-fA-F]{32}$/;
const md5_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(22, "==")));
const md5_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(22)));
// SHA1 (20 bytes): base64 = 28 chars total (27 + "=")
const sha1_hex = /^[0-9a-fA-F]{40}$/;
const sha1_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(27, "=")));
const sha1_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(27)));
// SHA256 (32 bytes): base64 = 44 chars total (43 + "=")
const sha256_hex = /^[0-9a-fA-F]{64}$/;
const sha256_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(43, "=")));
const sha256_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(43)));
// SHA384 (48 bytes): base64 = 64 chars total (no padding)
const sha384_hex = /^[0-9a-fA-F]{96}$/;
const sha384_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(64, "")));
const sha384_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(64)));
// SHA512 (64 bytes): base64 = 88 chars total (86 + "==")
const sha512_hex = /^[0-9a-fA-F]{128}$/;
const sha512_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(86, "==")));
const sha512_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(86)));

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js

// functions
function assertEqual(val) {
    return val;
}
function assertNotEqual(val) {
    return val;
}
function assertIs(_arg) { }
function assertNever(_x) {
    throw new Error("Unexpected value in exhaustive check");
}
function assert(_) { }
function getEnumValues(entries) {
    const numericValues = Object.values(entries).filter((v) => typeof v === "number");
    const values = Object.entries(entries)
        .filter(([k, _]) => numericValues.indexOf(+k) === -1)
        .map(([_, v]) => v);
    return values;
}
function joinValues(array, separator = "|") {
    return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
    if (typeof value === "bigint")
        return value.toString();
    return value;
}
function cached(getter) {
    const set = false;
    return {
        get value() {
            if (!set) {
                const value = getter();
                Object.defineProperty(this, "value", { value });
                return value;
            }
            throw new Error("cached value already set");
        },
    };
}
function nullish(input) {
    return input === null || input === undefined;
}
function cleanRegex(source) {
    const start = source.startsWith("^") ? 1 : 0;
    const end = source.endsWith("$") ? source.length - 1 : source.length;
    return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
    const ratio = val / step;
    const roundedRatio = Math.round(ratio);
    // Use a relative epsilon scaled to the magnitude of the result
    const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
    if (Math.abs(ratio - roundedRatio) < tolerance)
        return 0;
    return ratio - roundedRatio;
}
const EVALUATING = /* @__PURE__*/ Symbol("evaluating");
function defineLazy(object, key, getter) {
    let value = undefined;
    Object.defineProperty(object, key, {
        get() {
            if (value === EVALUATING) {
                // Circular reference detected, return undefined to break the cycle
                return undefined;
            }
            if (value === undefined) {
                value = EVALUATING;
                value = getter();
            }
            return value;
        },
        set(v) {
            Object.defineProperty(object, key, {
                value: v,
                // configurable: true,
            });
            // object[key] = v;
        },
        configurable: true,
    });
}
function objectClone(obj) {
    return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
    Object.defineProperty(target, prop, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}
function mergeDefs(...defs) {
    const mergedDescriptors = {};
    for (const def of defs) {
        const descriptors = Object.getOwnPropertyDescriptors(def);
        Object.assign(mergedDescriptors, descriptors);
    }
    return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
    return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
    if (!path)
        return obj;
    return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
    const keys = Object.keys(promisesObj);
    const promises = keys.map((key) => promisesObj[key]);
    return Promise.all(promises).then((results) => {
        const resolvedObj = {};
        for (let i = 0; i < keys.length; i++) {
            resolvedObj[keys[i]] = results[i];
        }
        return resolvedObj;
    });
}
function randomString(length = 10) {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let str = "";
    for (let i = 0; i < length; i++) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
}
function esc(str) {
    return JSON.stringify(str);
}
function slugify(input) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
const captureStackTrace = ("captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => { });
function util_isObject(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
}
const util_allowsEval = /* @__PURE__*/ cached(() => {
    // Skip the probe under `jitless`: strict CSPs report the caught `new Function`
    // as a `securitypolicyviolation` even though the throw is swallowed.
    if (globalConfig.jitless) {
        return false;
    }
    // @ts-ignore
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
        return false;
    }
    try {
        const F = Function;
        new F("");
        return true;
    }
    catch (_) {
        return false;
    }
});
function isPlainObject(o) {
    if (util_isObject(o) === false)
        return false;
    // modified constructor
    const ctor = o.constructor;
    if (ctor === undefined)
        return true;
    if (typeof ctor !== "function")
        return true;
    // modified prototype
    const prot = ctor.prototype;
    if (util_isObject(prot) === false)
        return false;
    // ctor doesn't have static `isPrototypeOf`
    if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
        return false;
    }
    return true;
}
function shallowClone(o) {
    if (isPlainObject(o))
        return { ...o };
    if (Array.isArray(o))
        return [...o];
    if (o instanceof Map)
        return new Map(o);
    if (o instanceof Set)
        return new Set(o);
    return o;
}
function numKeys(data) {
    let keyCount = 0;
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            keyCount++;
        }
    }
    return keyCount;
}
const getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
        case "undefined":
            return "undefined";
        case "string":
            return "string";
        case "number":
            return Number.isNaN(data) ? "nan" : "number";
        case "boolean":
            return "boolean";
        case "function":
            return "function";
        case "bigint":
            return "bigint";
        case "symbol":
            return "symbol";
        case "object":
            if (Array.isArray(data)) {
                return "array";
            }
            if (data === null) {
                return "null";
            }
            if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
                return "promise";
            }
            if (typeof Map !== "undefined" && data instanceof Map) {
                return "map";
            }
            if (typeof Set !== "undefined" && data instanceof Set) {
                return "set";
            }
            if (typeof Date !== "undefined" && data instanceof Date) {
                return "date";
            }
            // @ts-ignore
            if (typeof File !== "undefined" && data instanceof File) {
                return "file";
            }
            return "object";
        default:
            throw new Error(`Unknown data type: ${t}`);
    }
};
const propertyKeyTypes = /* @__PURE__*/ new Set(["string", "number", "symbol"]);
const primitiveTypes = /* @__PURE__*/ (/* unused pure expression or super */ null && (new Set([
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol",
    "undefined",
])));
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// zod-specific utils
function clone(inst, def, params) {
    const cl = new inst._zod.constr(def ?? inst._zod.def);
    if (!def || params?.parent)
        cl._zod.parent = inst;
    return cl;
}
function normalizeParams(_params) {
    const params = _params;
    if (!params)
        return {};
    if (typeof params === "string")
        return { error: () => params };
    if (params?.message !== undefined) {
        if (params?.error !== undefined)
            throw new Error("Cannot specify both `message` and `error` params");
        params.error = params.message;
    }
    delete params.message;
    if (typeof params.error === "string")
        return { ...params, error: () => params.error };
    return params;
}
function createTransparentProxy(getter) {
    let target;
    return new Proxy({}, {
        get(_, prop, receiver) {
            target ?? (target = getter());
            return Reflect.get(target, prop, receiver);
        },
        set(_, prop, value, receiver) {
            target ?? (target = getter());
            return Reflect.set(target, prop, value, receiver);
        },
        has(_, prop) {
            target ?? (target = getter());
            return Reflect.has(target, prop);
        },
        deleteProperty(_, prop) {
            target ?? (target = getter());
            return Reflect.deleteProperty(target, prop);
        },
        ownKeys(_) {
            target ?? (target = getter());
            return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(_, prop) {
            target ?? (target = getter());
            return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        defineProperty(_, prop, descriptor) {
            target ?? (target = getter());
            return Reflect.defineProperty(target, prop, descriptor);
        },
    });
}
function stringifyPrimitive(value) {
    if (typeof value === "bigint")
        return value.toString() + "n";
    if (typeof value === "string")
        return `"${value}"`;
    return `${value}`;
}
function optionalKeys(shape) {
    return Object.keys(shape).filter((k) => {
        return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
    });
}
const NUMBER_FORMAT_RANGES = {
    safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    int32: [-2147483648, 2147483647],
    uint32: [0, 4294967295],
    float32: [-3.4028234663852886e38, 3.4028234663852886e38],
    float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
};
const BIGINT_FORMAT_RANGES = (/* unused pure expression or super */ null && ({
    int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
    uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")],
}));
function pick(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        throw new Error(".pick() cannot be used on object schemas containing refinements");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const newShape = {};
            for (const key in mask) {
                if (!(key in currDef.shape)) {
                    throw new Error(`Unrecognized key: "${key}"`);
                }
                if (!mask[key])
                    continue;
                newShape[key] = currDef.shape[key];
            }
            assignProp(this, "shape", newShape); // self-caching
            return newShape;
        },
        checks: [],
    });
    return clone(schema, def);
}
function omit(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        throw new Error(".omit() cannot be used on object schemas containing refinements");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const newShape = { ...schema._zod.def.shape };
            for (const key in mask) {
                if (!(key in currDef.shape)) {
                    throw new Error(`Unrecognized key: "${key}"`);
                }
                if (!mask[key])
                    continue;
                delete newShape[key];
            }
            assignProp(this, "shape", newShape); // self-caching
            return newShape;
        },
        checks: [],
    });
    return clone(schema, def);
}
function extend(schema, shape) {
    if (!isPlainObject(shape)) {
        throw new Error("Invalid input to extend: expected a plain object");
    }
    const checks = schema._zod.def.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        // Only throw if new shape overlaps with existing shape
        // Use getOwnPropertyDescriptor to check key existence without accessing values
        const existingShape = schema._zod.def.shape;
        for (const key in shape) {
            if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
                throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
            }
        }
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const _shape = { ...schema._zod.def.shape, ...shape };
            assignProp(this, "shape", _shape); // self-caching
            return _shape;
        },
    });
    return clone(schema, def);
}
function safeExtend(schema, shape) {
    if (!isPlainObject(shape)) {
        throw new Error("Invalid input to safeExtend: expected a plain object");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const _shape = { ...schema._zod.def.shape, ...shape };
            assignProp(this, "shape", _shape); // self-caching
            return _shape;
        },
    });
    return clone(schema, def);
}
function merge(a, b) {
    if (a._zod.def.checks?.length) {
        throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
    }
    const def = mergeDefs(a._zod.def, {
        get shape() {
            const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
            assignProp(this, "shape", _shape); // self-caching
            return _shape;
        },
        get catchall() {
            return b._zod.def.catchall;
        },
        checks: b._zod.def.checks ?? [],
    });
    return clone(a, def);
}
function partial(Class, schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        throw new Error(".partial() cannot be used on object schemas containing refinements");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const oldShape = schema._zod.def.shape;
            const shape = { ...oldShape };
            if (mask) {
                for (const key in mask) {
                    if (!(key in oldShape)) {
                        throw new Error(`Unrecognized key: "${key}"`);
                    }
                    if (!mask[key])
                        continue;
                    // if (oldShape[key]!._zod.optin === "optional") continue;
                    shape[key] = Class
                        ? new Class({
                            type: "optional",
                            innerType: oldShape[key],
                        })
                        : oldShape[key];
                }
            }
            else {
                for (const key in oldShape) {
                    // if (oldShape[key]!._zod.optin === "optional") continue;
                    shape[key] = Class
                        ? new Class({
                            type: "optional",
                            innerType: oldShape[key],
                        })
                        : oldShape[key];
                }
            }
            assignProp(this, "shape", shape); // self-caching
            return shape;
        },
        checks: [],
    });
    return clone(schema, def);
}
function required(Class, schema, mask) {
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const oldShape = schema._zod.def.shape;
            const shape = { ...oldShape };
            if (mask) {
                for (const key in mask) {
                    if (!(key in shape)) {
                        throw new Error(`Unrecognized key: "${key}"`);
                    }
                    if (!mask[key])
                        continue;
                    // overwrite with non-optional
                    shape[key] = new Class({
                        type: "nonoptional",
                        innerType: oldShape[key],
                    });
                }
            }
            else {
                for (const key in oldShape) {
                    // overwrite with non-optional
                    shape[key] = new Class({
                        type: "nonoptional",
                        innerType: oldShape[key],
                    });
                }
            }
            assignProp(this, "shape", shape); // self-caching
            return shape;
        },
    });
    return clone(schema, def);
}
// invalid_type | too_big | too_small | invalid_format | not_multiple_of | unrecognized_keys | invalid_union | invalid_key | invalid_element | invalid_value | custom
function aborted(x, startIndex = 0) {
    if (x.aborted === true)
        return true;
    for (let i = startIndex; i < x.issues.length; i++) {
        if (x.issues[i]?.continue !== true) {
            return true;
        }
    }
    return false;
}
// Checks for explicit abort (continue === false), as opposed to implicit abort (continue === undefined).
// Used to respect `abort: true` in .refine() even for checks that have a `when` function.
function explicitlyAborted(x, startIndex = 0) {
    if (x.aborted === true)
        return true;
    for (let i = startIndex; i < x.issues.length; i++) {
        if (x.issues[i]?.continue === false) {
            return true;
        }
    }
    return false;
}
function prefixIssues(path, issues) {
    return issues.map((iss) => {
        var _a;
        (_a = iss).path ?? (_a.path = []);
        iss.path.unshift(path);
        return iss;
    });
}
function unwrapMessage(message) {
    return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
    const message = iss.message
        ? iss.message
        : (unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ??
            unwrapMessage(ctx?.error?.(iss)) ??
            unwrapMessage(config.customError?.(iss)) ??
            unwrapMessage(config.localeError?.(iss)) ??
            "Invalid input");
    const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
    rest.path ?? (rest.path = []);
    rest.message = message;
    if (ctx?.reportInput) {
        rest.input = _input;
    }
    return rest;
}
function getSizableOrigin(input) {
    if (input instanceof Set)
        return "set";
    if (input instanceof Map)
        return "map";
    // @ts-ignore
    if (input instanceof File)
        return "file";
    return "unknown";
}
function getLengthableOrigin(input) {
    if (Array.isArray(input))
        return "array";
    if (typeof input === "string")
        return "string";
    return "unknown";
}
function parsedType(data) {
    const t = typeof data;
    switch (t) {
        case "number": {
            return Number.isNaN(data) ? "nan" : "number";
        }
        case "object": {
            if (data === null) {
                return "null";
            }
            if (Array.isArray(data)) {
                return "array";
            }
            const obj = data;
            if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
                return obj.constructor.name;
            }
        }
    }
    return t;
}
function util_issue(...args) {
    const [iss, input, inst] = args;
    if (typeof iss === "string") {
        return {
            message: iss,
            code: "custom",
            input,
            inst,
        };
    }
    return { ...iss };
}
function cleanEnum(obj) {
    return Object.entries(obj)
        .filter(([k, _]) => {
        // return true if NaN, meaning it's not a number, thus a string key
        return Number.isNaN(Number.parseInt(k, 10));
    })
        .map((el) => el[1]);
}
// Codec utility functions
function base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
function uint8ArrayToBase64(bytes) {
    let binaryString = "";
    for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryString);
}
function base64urlToUint8Array(base64url) {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    return base64ToUint8Array(base64 + padding);
}
function uint8ArrayToBase64url(bytes) {
    return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
    const cleanHex = hex.replace(/^0x/, "");
    if (cleanHex.length % 2 !== 0) {
        throw new Error("Invalid hex string length");
    }
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
    }
    return bytes;
}
function uint8ArrayToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
// instanceof
class Class {
    constructor(..._args) { }
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
/* unused harmony import specifier */ var core;
/* unused harmony import specifier */ var checks_util;
// import { $ZodType } from "./schemas.js";



const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
    var _a;
    inst._zod ?? (inst._zod = {});
    inst._zod.def = def;
    (_a = inst._zod).onattach ?? (_a.onattach = []);
});
const numericOriginMap = {
    number: "number",
    bigint: "bigint",
    object: "date",
};
const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
        if (def.value < curr) {
            if (def.inclusive)
                bag.maximum = def.value;
            else
                bag.exclusiveMaximum = def.value;
        }
    });
    inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
            return;
        }
        payload.issues.push({
            origin,
            code: "too_big",
            maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
            input: payload.value,
            inclusive: def.inclusive,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
        if (def.value > curr) {
            if (def.inclusive)
                bag.minimum = def.value;
            else
                bag.exclusiveMinimum = def.value;
        }
    });
    inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
            return;
        }
        payload.issues.push({
            origin,
            code: "too_small",
            minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
            input: payload.value,
            inclusive: def.inclusive,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckMultipleOf =
/*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst) => {
        var _a;
        (_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
    });
    inst._zod.check = (payload) => {
        if (typeof payload.value !== typeof def.value)
            throw new Error("Cannot mix number and bigint in multiple_of check.");
        const isMultiple = typeof payload.value === "bigint"
            ? payload.value % def.value === BigInt(0)
            : floatSafeRemainder(payload.value, def.value) === 0;
        if (isMultiple)
            return;
        payload.issues.push({
            origin: typeof payload.value,
            code: "not_multiple_of",
            divisor: def.value,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
    $ZodCheck.init(inst, def); // no format checks
    def.format = def.format || "float64";
    const isInt = def.format?.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        bag.minimum = minimum;
        bag.maximum = maximum;
        if (isInt)
            bag.pattern = integer;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        if (isInt) {
            if (!Number.isInteger(input)) {
                // invalid_format issue
                // payload.issues.push({
                //   expected: def.format,
                //   format: def.format,
                //   code: "invalid_format",
                //   input,
                //   inst,
                // });
                // invalid_type issue
                payload.issues.push({
                    expected: origin,
                    format: def.format,
                    code: "invalid_type",
                    continue: false,
                    input,
                    inst,
                });
                return;
                // not_multiple_of issue
                // payload.issues.push({
                //   code: "not_multiple_of",
                //   origin: "number",
                //   input,
                //   inst,
                //   divisor: 1,
                // });
            }
            if (!Number.isSafeInteger(input)) {
                if (input > 0) {
                    // too_big
                    payload.issues.push({
                        input,
                        code: "too_big",
                        maximum: Number.MAX_SAFE_INTEGER,
                        note: "Integers must be within the safe integer range.",
                        inst,
                        origin,
                        inclusive: true,
                        continue: !def.abort,
                    });
                }
                else {
                    // too_small
                    payload.issues.push({
                        input,
                        code: "too_small",
                        minimum: Number.MIN_SAFE_INTEGER,
                        note: "Integers must be within the safe integer range.",
                        inst,
                        origin,
                        inclusive: true,
                        continue: !def.abort,
                    });
                }
                return;
            }
        }
        if (input < minimum) {
            payload.issues.push({
                origin: "number",
                input,
                code: "too_small",
                minimum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
        if (input > maximum) {
            payload.issues.push({
                origin: "number",
                input,
                code: "too_big",
                maximum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodCheckBigIntFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckBigIntFormat", (inst, def) => {
    $ZodCheck.init(inst, def); // no format checks
    const [minimum, maximum] = checks_util.BIGINT_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        bag.minimum = minimum;
        bag.maximum = maximum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        if (input < minimum) {
            payload.issues.push({
                origin: "bigint",
                input,
                code: "too_small",
                minimum: minimum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
        if (input > maximum) {
            payload.issues.push({
                origin: "bigint",
                input,
                code: "too_big",
                maximum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
    };
})));
const $ZodCheckMaxSize = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckMaxSize", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !checks_util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY);
        if (def.maximum < curr)
            inst._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size <= def.maximum)
            return;
        payload.issues.push({
            origin: checks_util.getSizableOrigin(input),
            code: "too_big",
            maximum: def.maximum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckMinSize = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckMinSize", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !checks_util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY);
        if (def.minimum > curr)
            inst._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size >= def.minimum)
            return;
        payload.issues.push({
            origin: checks_util.getSizableOrigin(input),
            code: "too_small",
            minimum: def.minimum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckSizeEquals = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckSizeEquals", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !checks_util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.minimum = def.size;
        bag.maximum = def.size;
        bag.size = def.size;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size === def.size)
            return;
        const tooBig = size > def.size;
        payload.issues.push({
            origin: checks_util.getSizableOrigin(input),
            ...(tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size }),
            inclusive: true,
            exact: true,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY);
        if (def.maximum < curr)
            inst._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length <= def.maximum)
            return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
            origin,
            code: "too_big",
            maximum: def.maximum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY);
        if (def.minimum > curr)
            inst._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length >= def.minimum)
            return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
            origin,
            code: "too_small",
            minimum: def.minimum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.minimum = def.length;
        bag.maximum = def.length;
        bag.length = def.length;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length === def.length)
            return;
        const origin = getLengthableOrigin(input);
        const tooBig = length > def.length;
        payload.issues.push({
            origin,
            ...(tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length }),
            inclusive: true,
            exact: true,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
    var _a, _b;
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        if (def.pattern) {
            bag.patterns ?? (bag.patterns = new Set());
            bag.patterns.add(def.pattern);
        }
    });
    if (def.pattern)
        (_a = inst._zod).check ?? (_a.check = (payload) => {
            def.pattern.lastIndex = 0;
            if (def.pattern.test(payload.value))
                return;
            payload.issues.push({
                origin: "string",
                code: "invalid_format",
                format: def.format,
                input: payload.value,
                ...(def.pattern ? { pattern: def.pattern.toString() } : {}),
                inst,
                continue: !def.abort,
            });
        });
    else
        (_b = inst._zod).check ?? (_b.check = () => { });
});
const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "regex",
            input: payload.value,
            pattern: def.pattern.toString(),
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
    def.pattern ?? (def.pattern = lowercase);
    $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
    def.pattern ?? (def.pattern = uppercase);
    $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
    $ZodCheck.init(inst, def);
    const escapedRegex = escapeRegex(def.includes);
    const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
    def.pattern = pattern;
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.includes(def.includes, def.position))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "includes",
            includes: def.includes,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.startsWith(def.prefix))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "starts_with",
            prefix: def.prefix,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.endsWith(def.suffix))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "ends_with",
            suffix: def.suffix,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
///////////////////////////////////
/////    $ZodCheckProperty    /////
///////////////////////////////////
function handleCheckPropertyResult(result, payload, property) {
    if (result.issues.length) {
        payload.issues.push(...checks_util.prefixIssues(property, result.issues));
    }
}
const $ZodCheckProperty = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckProperty", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
        const result = def.schema._zod.run({
            value: payload.value[def.property],
            issues: [],
        }, {});
        if (result instanceof Promise) {
            return result.then((result) => handleCheckPropertyResult(result, payload, def.property));
        }
        handleCheckPropertyResult(result, payload, def.property);
        return;
    };
})));
const $ZodCheckMimeType = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckMimeType", (inst, def) => {
    $ZodCheck.init(inst, def);
    const mimeSet = new Set(def.mime);
    inst._zod.onattach.push((inst) => {
        inst._zod.bag.mime = def.mime;
    });
    inst._zod.check = (payload) => {
        if (mimeSet.has(payload.value.type))
            return;
        payload.issues.push({
            code: "invalid_value",
            values: def.mime,
            input: payload.value.type,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
        payload.value = def.tx(payload.value);
    };
});

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
class Doc {
    constructor(args = []) {
        this.content = [];
        this.indent = 0;
        if (this)
            this.args = args;
    }
    indented(fn) {
        this.indent += 1;
        fn(this);
        this.indent -= 1;
    }
    write(arg) {
        if (typeof arg === "function") {
            arg(this, { execution: "sync" });
            arg(this, { execution: "async" });
            return;
        }
        const content = arg;
        const lines = content.split("\n").filter((x) => x);
        const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
        const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
        for (const line of dedented) {
            this.content.push(line);
        }
    }
    compile() {
        const F = Function;
        const args = this?.args;
        const content = this?.content ?? [``];
        const lines = [...content.map((x) => `  ${x}`)];
        // console.log(lines.join("\n"));
        return new F(...args, lines.join("\n"));
    }
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js


const initializer = (inst, def) => {
    inst.name = "$ZodError";
    Object.defineProperty(inst, "_zod", {
        value: inst._zod,
        enumerable: false,
    });
    Object.defineProperty(inst, "issues", {
        value: def,
        enumerable: false,
    });
    inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
    Object.defineProperty(inst, "toString", {
        value: () => inst.message,
        enumerable: false,
    });
};
const $ZodError = $constructor("$ZodError", initializer);
const $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of error.issues) {
        if (sub.path.length > 0) {
            fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
            fieldErrors[sub.path[0]].push(mapper(sub));
        }
        else {
            formErrors.push(mapper(sub));
        }
    }
    return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue) => issue.message) {
    const fieldErrors = { _errors: [] };
    const processError = (error, path = []) => {
        for (const issue of error.issues) {
            if (issue.code === "invalid_union" && issue.errors.length) {
                issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
            }
            else if (issue.code === "invalid_key") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else if (issue.code === "invalid_element") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else {
                const fullpath = [...path, ...issue.path];
                if (fullpath.length === 0) {
                    fieldErrors._errors.push(mapper(issue));
                }
                else {
                    let curr = fieldErrors;
                    let i = 0;
                    while (i < fullpath.length) {
                        const el = fullpath[i];
                        const terminal = i === fullpath.length - 1;
                        if (!terminal) {
                            curr[el] = curr[el] || { _errors: [] };
                        }
                        else {
                            curr[el] = curr[el] || { _errors: [] };
                            curr[el]._errors.push(mapper(issue));
                        }
                        curr = curr[el];
                        i++;
                    }
                }
            }
        }
    };
    processError(error);
    return fieldErrors;
}
function treeifyError(error, mapper = (issue) => issue.message) {
    const result = { errors: [] };
    const processError = (error, path = []) => {
        var _a, _b;
        for (const issue of error.issues) {
            if (issue.code === "invalid_union" && issue.errors.length) {
                // regular union error
                issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
            }
            else if (issue.code === "invalid_key") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else if (issue.code === "invalid_element") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else {
                const fullpath = [...path, ...issue.path];
                if (fullpath.length === 0) {
                    result.errors.push(mapper(issue));
                    continue;
                }
                let curr = result;
                let i = 0;
                while (i < fullpath.length) {
                    const el = fullpath[i];
                    const terminal = i === fullpath.length - 1;
                    if (typeof el === "string") {
                        curr.properties ?? (curr.properties = {});
                        (_a = curr.properties)[el] ?? (_a[el] = { errors: [] });
                        curr = curr.properties[el];
                    }
                    else {
                        curr.items ?? (curr.items = []);
                        (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
                        curr = curr.items[el];
                    }
                    if (terminal) {
                        curr.errors.push(mapper(issue));
                    }
                    i++;
                }
            }
        }
    };
    processError(error);
    return result;
}
/** Format a ZodError as a human-readable string in the following form.
 *
 * From
 *
 * ```ts
 * ZodError {
 *   issues: [
 *     {
 *       expected: 'string',
 *       code: 'invalid_type',
 *       path: [ 'username' ],
 *       message: 'Invalid input: expected string'
 *     },
 *     {
 *       expected: 'number',
 *       code: 'invalid_type',
 *       path: [ 'favoriteNumbers', 1 ],
 *       message: 'Invalid input: expected number'
 *     }
 *   ];
 * }
 * ```
 *
 * to
 *
 * ```
 * username
 *   ✖ Expected number, received string at "username
 * favoriteNumbers[0]
 *   ✖ Invalid input: expected number
 * ```
 */
function toDotPath(_path) {
    const segs = [];
    const path = _path.map((seg) => (typeof seg === "object" ? seg.key : seg));
    for (const seg of path) {
        if (typeof seg === "number")
            segs.push(`[${seg}]`);
        else if (typeof seg === "symbol")
            segs.push(`[${JSON.stringify(String(seg))}]`);
        else if (/[^\w$]/.test(seg))
            segs.push(`[${JSON.stringify(seg)}]`);
        else {
            if (segs.length)
                segs.push(".");
            segs.push(seg);
        }
    }
    return segs.join("");
}
function prettifyError(error) {
    const lines = [];
    // sort by path length
    const issues = [...error.issues].sort((a, b) => (a.path ?? []).length - (b.path ?? []).length);
    // Process each issue
    for (const issue of issues) {
        lines.push(`✖ ${issue.message}`);
        if (issue.path?.length)
            lines.push(`  → at ${toDotPath(issue.path)}`);
    }
    // Convert Map to formatted string
    return lines.join("\n");
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js



const _parse = (_Err) => (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    if (result.issues.length) {
        const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, _params?.callee);
        throw e;
    }
    return result.value;
};
const parse = /* @__PURE__*/ _parse($ZodRealError);
const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    if (result.issues.length) {
        const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, params?.callee);
        throw e;
    }
    return result.value;
};
const parseAsync = /* @__PURE__*/ _parseAsync($ZodRealError);
const _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    return result.issues.length
        ? {
            success: false,
            error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParse = /* @__PURE__*/ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    return result.issues.length
        ? {
            success: false,
            error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParseAsync = /* @__PURE__*/ _safeParseAsync($ZodRealError);
const _encode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _parse(_Err)(schema, value, ctx);
};
const encode = /* @__PURE__*/ _encode($ZodRealError);
const _decode = (_Err) => (schema, value, _ctx) => {
    return _parse(_Err)(schema, value, _ctx);
};
const decode = /* @__PURE__*/ _decode($ZodRealError);
const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _parseAsync(_Err)(schema, value, ctx);
};
const encodeAsync = /* @__PURE__*/ _encodeAsync($ZodRealError);
const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _parseAsync(_Err)(schema, value, _ctx);
};
const decodeAsync = /* @__PURE__*/ _decodeAsync($ZodRealError);
const _safeEncode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParse(_Err)(schema, value, ctx);
};
const safeEncode = /* @__PURE__*/ _safeEncode($ZodRealError);
const _safeDecode = (_Err) => (schema, value, _ctx) => {
    return _safeParse(_Err)(schema, value, _ctx);
};
const safeDecode = /* @__PURE__*/ _safeDecode($ZodRealError);
const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParseAsync(_Err)(schema, value, ctx);
};
const safeEncodeAsync = /* @__PURE__*/ _safeEncodeAsync($ZodRealError);
const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _safeParseAsync(_Err)(schema, value, _ctx);
};
const safeDecodeAsync = /* @__PURE__*/ _safeDecodeAsync($ZodRealError);

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
const version = {
    major: 4,
    minor: 4,
    patch: 3,
};

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
/* unused harmony import specifier */ var checks;
/* unused harmony import specifier */ var schemas_core;
/* unused harmony import specifier */ var schemas_parse;
/* unused harmony import specifier */ var schemas_parseAsync;
/* unused harmony import specifier */ var regexes;
/* unused harmony import specifier */ var schemas_util;







const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
    var _a;
    inst ?? (inst = {});
    inst._zod.def = def; // set _def property
    inst._zod.bag = inst._zod.bag || {}; // initialize _bag object
    inst._zod.version = version;
    const checks = [...(inst._zod.def.checks ?? [])];
    // if inst is itself a checks.$ZodCheck, run it as a check
    if (inst._zod.traits.has("$ZodCheck")) {
        checks.unshift(inst);
    }
    for (const ch of checks) {
        for (const fn of ch._zod.onattach) {
            fn(inst);
        }
    }
    if (checks.length === 0) {
        // deferred initializer
        // inst._zod.parse is not yet defined
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        inst._zod.deferred?.push(() => {
            inst._zod.run = inst._zod.parse;
        });
    }
    else {
        const runChecks = (payload, checks, ctx) => {
            let isAborted = aborted(payload);
            let asyncResult;
            for (const ch of checks) {
                if (ch._zod.def.when) {
                    if (explicitlyAborted(payload))
                        continue;
                    const shouldRun = ch._zod.def.when(payload);
                    if (!shouldRun)
                        continue;
                }
                else if (isAborted) {
                    continue;
                }
                const currLen = payload.issues.length;
                const _ = ch._zod.check(payload);
                if (_ instanceof Promise && ctx?.async === false) {
                    throw new $ZodAsyncError();
                }
                if (asyncResult || _ instanceof Promise) {
                    asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
                        await _;
                        const nextLen = payload.issues.length;
                        if (nextLen === currLen)
                            return;
                        if (!isAborted)
                            isAborted = aborted(payload, currLen);
                    });
                }
                else {
                    const nextLen = payload.issues.length;
                    if (nextLen === currLen)
                        continue;
                    if (!isAborted)
                        isAborted = aborted(payload, currLen);
                }
            }
            if (asyncResult) {
                return asyncResult.then(() => {
                    return payload;
                });
            }
            return payload;
        };
        const handleCanaryResult = (canary, payload, ctx) => {
            // abort if the canary is aborted
            if (aborted(canary)) {
                canary.aborted = true;
                return canary;
            }
            // run checks first, then
            const checkResult = runChecks(payload, checks, ctx);
            if (checkResult instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
            }
            return inst._zod.parse(checkResult, ctx);
        };
        inst._zod.run = (payload, ctx) => {
            if (ctx.skipChecks) {
                return inst._zod.parse(payload, ctx);
            }
            if (ctx.direction === "backward") {
                // run canary
                // initial pass (no checks)
                const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
                if (canary instanceof Promise) {
                    return canary.then((canary) => {
                        return handleCanaryResult(canary, payload, ctx);
                    });
                }
                return handleCanaryResult(canary, payload, ctx);
            }
            // forward
            const result = inst._zod.parse(payload, ctx);
            if (result instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return result.then((result) => runChecks(result, checks, ctx));
            }
            return runChecks(result, checks, ctx);
        };
    }
    // Lazy initialize ~standard to avoid creating objects for every schema
    defineLazy(inst, "~standard", () => ({
        validate: (value) => {
            try {
                const r = safeParse(inst, value);
                return r.success ? { value: r.data } : { issues: r.error?.issues };
            }
            catch (_) {
                return safeParseAsync(inst, value).then((r) => (r.success ? { value: r.data } : { issues: r.error?.issues }));
            }
        },
        vendor: "zod",
        version: 1,
    }));
});

const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = [...(inst?._zod.bag?.patterns ?? [])].pop() ?? string(inst._zod.bag);
    inst._zod.parse = (payload, _) => {
        if (def.coerce)
            try {
                payload.value = String(payload.value);
            }
            catch (_) { }
        if (typeof payload.value === "string")
            return payload;
        payload.issues.push({
            expected: "string",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
    // check initialization must come first
    $ZodCheckStringFormat.init(inst, def);
    $ZodString.init(inst, def);
});
const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
    def.pattern ?? (def.pattern = guid);
    $ZodStringFormat.init(inst, def);
});
const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
    if (def.version) {
        const versionMap = {
            v1: 1,
            v2: 2,
            v3: 3,
            v4: 4,
            v5: 5,
            v6: 6,
            v7: 7,
            v8: 8,
        };
        const v = versionMap[def.version];
        if (v === undefined)
            throw new Error(`Invalid UUID version: "${def.version}"`);
        def.pattern ?? (def.pattern = uuid(v));
    }
    else
        def.pattern ?? (def.pattern = uuid());
    $ZodStringFormat.init(inst, def);
});
const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
    def.pattern ?? (def.pattern = email);
    $ZodStringFormat.init(inst, def);
});
const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        try {
            // Trim whitespace from input
            const trimmed = payload.value.trim();
            // When normalize is off, require :// for http/https URLs
            // This prevents strings like "http:example.com" or "https:/path" from being silently accepted
            if (!def.normalize && def.protocol?.source === httpProtocol.source) {
                if (!/^https?:\/\//i.test(trimmed)) {
                    payload.issues.push({
                        code: "invalid_format",
                        format: "url",
                        note: "Invalid URL format",
                        input: payload.value,
                        inst,
                        continue: !def.abort,
                    });
                    return;
                }
            }
            // @ts-ignore
            const url = new URL(trimmed);
            if (def.hostname) {
                def.hostname.lastIndex = 0;
                if (!def.hostname.test(url.hostname)) {
                    payload.issues.push({
                        code: "invalid_format",
                        format: "url",
                        note: "Invalid hostname",
                        pattern: def.hostname.source,
                        input: payload.value,
                        inst,
                        continue: !def.abort,
                    });
                }
            }
            if (def.protocol) {
                def.protocol.lastIndex = 0;
                if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
                    payload.issues.push({
                        code: "invalid_format",
                        format: "url",
                        note: "Invalid protocol",
                        pattern: def.protocol.source,
                        input: payload.value,
                        inst,
                        continue: !def.abort,
                    });
                }
            }
            // Set the output value based on normalize flag
            if (def.normalize) {
                // Use normalized URL
                payload.value = url.href;
            }
            else {
                // Preserve the original input (trimmed)
                payload.value = trimmed;
            }
            return;
        }
        catch (_) {
            payload.issues.push({
                code: "invalid_format",
                format: "url",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
    def.pattern ?? (def.pattern = emoji());
    $ZodStringFormat.init(inst, def);
});
const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
    def.pattern ?? (def.pattern = nanoid);
    $ZodStringFormat.init(inst, def);
});
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
    def.pattern ?? (def.pattern = cuid);
    $ZodStringFormat.init(inst, def);
});
const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
    def.pattern ?? (def.pattern = cuid2);
    $ZodStringFormat.init(inst, def);
});
const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
    def.pattern ?? (def.pattern = ulid);
    $ZodStringFormat.init(inst, def);
});
const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
    def.pattern ?? (def.pattern = xid);
    $ZodStringFormat.init(inst, def);
});
const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
    def.pattern ?? (def.pattern = ksuid);
    $ZodStringFormat.init(inst, def);
});
const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
    def.pattern ?? (def.pattern = datetime(def));
    $ZodStringFormat.init(inst, def);
});
const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
    def.pattern ?? (def.pattern = date);
    $ZodStringFormat.init(inst, def);
});
const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
    def.pattern ?? (def.pattern = time(def));
    $ZodStringFormat.init(inst, def);
});
const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
    def.pattern ?? (def.pattern = duration);
    $ZodStringFormat.init(inst, def);
});
const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
    def.pattern ?? (def.pattern = ipv4);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.format = `ipv4`;
});
const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
    def.pattern ?? (def.pattern = ipv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.format = `ipv6`;
    inst._zod.check = (payload) => {
        try {
            // @ts-ignore
            new URL(`http://[${payload.value}]`);
            // return;
        }
        catch {
            payload.issues.push({
                code: "invalid_format",
                format: "ipv6",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodMAC = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodMAC", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.mac(def.delimiter));
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.format = `mac`;
})));
const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv4);
    $ZodStringFormat.init(inst, def);
});
const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv6); // not used for validation
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        const parts = payload.value.split("/");
        try {
            if (parts.length !== 2)
                throw new Error();
            const [address, prefix] = parts;
            if (!prefix)
                throw new Error();
            const prefixNum = Number(prefix);
            if (`${prefixNum}` !== prefix)
                throw new Error();
            if (prefixNum < 0 || prefixNum > 128)
                throw new Error();
            // @ts-ignore
            new URL(`http://[${address}]`);
        }
        catch {
            payload.issues.push({
                code: "invalid_format",
                format: "cidrv6",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
//////////////////////////////   ZodBase64   //////////////////////////////
function isValidBase64(data) {
    if (data === "")
        return true;
    // atob ignores whitespace, so reject it up front.
    if (/\s/.test(data))
        return false;
    if (data.length % 4 !== 0)
        return false;
    try {
        // @ts-ignore
        atob(data);
        return true;
    }
    catch {
        return false;
    }
}
const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
    def.pattern ?? (def.pattern = base64);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.contentEncoding = "base64";
    inst._zod.check = (payload) => {
        if (isValidBase64(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "base64",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
//////////////////////////////   ZodBase64   //////////////////////////////
function isValidBase64URL(data) {
    if (!base64url.test(data))
        return false;
    const base64 = data.replace(/[-_]/g, (c) => (c === "-" ? "+" : "/"));
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return isValidBase64(padded);
}
const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
    def.pattern ?? (def.pattern = base64url);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.contentEncoding = "base64url";
    inst._zod.check = (payload) => {
        if (isValidBase64URL(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "base64url",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
    def.pattern ?? (def.pattern = e164);
    $ZodStringFormat.init(inst, def);
});
//////////////////////////////   ZodJWT   //////////////////////////////
function isValidJWT(token, algorithm = null) {
    try {
        const tokensParts = token.split(".");
        if (tokensParts.length !== 3)
            return false;
        const [header] = tokensParts;
        if (!header)
            return false;
        // @ts-ignore
        const parsedHeader = JSON.parse(atob(header));
        if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
            return false;
        if (!parsedHeader.alg)
            return false;
        if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
            return false;
        return true;
    }
    catch {
        return false;
    }
}
const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (isValidJWT(payload.value, def.alg))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "jwt",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCustomStringFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodCustomStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (def.fn(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: def.format,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = inst._zod.bag.pattern ?? number;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Number(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
            return payload;
        }
        const received = typeof input === "number"
            ? Number.isNaN(input)
                ? "NaN"
                : !Number.isFinite(input)
                    ? "Infinity"
                    : undefined
            : undefined;
        payload.issues.push({
            expected: "number",
            code: "invalid_type",
            input,
            inst,
            ...(received ? { received } : {}),
        });
        return payload;
    };
});
const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
    $ZodCheckNumberFormat.init(inst, def);
    $ZodNumber.init(inst, def); // no format checks
});
const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = regexes_boolean;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Boolean(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "boolean")
            return payload;
        payload.issues.push({
            expected: "boolean",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
});
const $ZodBigInt = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodBigInt", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = regexes.bigint;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = BigInt(payload.value);
            }
            catch (_) { }
        if (typeof payload.value === "bigint")
            return payload;
        payload.issues.push({
            expected: "bigint",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
})));
const $ZodBigIntFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodBigIntFormat", (inst, def) => {
    checks.$ZodCheckBigIntFormat.init(inst, def);
    $ZodBigInt.init(inst, def); // no format checks
})));
const $ZodSymbol = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodSymbol", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "symbol")
            return payload;
        payload.issues.push({
            expected: "symbol",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodUndefined = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodUndefined", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = regexes.undefined;
    inst._zod.values = new Set([undefined]);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "undefined")
            return payload;
        payload.issues.push({
            expected: "undefined",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodNull = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodNull", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = regexes.null;
    inst._zod.values = new Set([null]);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (input === null)
            return payload;
        payload.issues.push({
            expected: "null",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodAny = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodAny", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
})));
const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
});
const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        payload.issues.push({
            expected: "never",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
const $ZodVoid = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodVoid", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "undefined")
            return payload;
        payload.issues.push({
            expected: "void",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodDate = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodDate", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce) {
            try {
                payload.value = new Date(payload.value);
            }
            catch (_err) { }
        }
        const input = payload.value;
        const isDate = input instanceof Date;
        const isValidDate = isDate && !Number.isNaN(input.getTime());
        if (isValidDate)
            return payload;
        payload.issues.push({
            expected: "date",
            code: "invalid_type",
            input,
            ...(isDate ? { received: "Invalid Date" } : {}),
            inst,
        });
        return payload;
    };
})));
function handleArrayResult(result, final, index) {
    if (result.issues.length) {
        final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
}
const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
            payload.issues.push({
                expected: "array",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = Array(input.length);
        const proms = [];
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const result = def.element._zod.run({
                value: item,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                proms.push(result.then((result) => handleArrayResult(result, payload, i)));
            }
            else {
                handleArrayResult(result, payload, i);
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload; //handleArrayResultsAsync(parseResults, final);
    };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
    const isPresent = key in input;
    if (result.issues.length) {
        // For optional-in/out schemas, ignore errors on absent keys.
        if (isOptionalIn && isOptionalOut && !isPresent) {
            return;
        }
        final.issues.push(...prefixIssues(key, result.issues));
    }
    if (!isPresent && !isOptionalIn) {
        if (!result.issues.length) {
            final.issues.push({
                code: "invalid_type",
                expected: "nonoptional",
                input: undefined,
                path: [key],
            });
        }
        return;
    }
    if (result.value === undefined) {
        if (isPresent) {
            final.value[key] = undefined;
        }
    }
    else {
        final.value[key] = result.value;
    }
}
function normalizeDef(def) {
    const keys = Object.keys(def.shape);
    for (const k of keys) {
        if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
            throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
        }
    }
    const okeys = optionalKeys(def.shape);
    return {
        ...def,
        keys,
        keySet: new Set(keys),
        numKeys: keys.length,
        optionalKeys: new Set(okeys),
    };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
    const unrecognized = [];
    const keySet = def.keySet;
    const _catchall = def.catchall._zod;
    const t = _catchall.def.type;
    const isOptionalIn = _catchall.optin === "optional";
    const isOptionalOut = _catchall.optout === "optional";
    for (const key in input) {
        // skip __proto__ so it can't replace the result prototype via the
        // assignment setter on the plain {} we build into
        if (key === "__proto__")
            continue;
        if (keySet.has(key))
            continue;
        if (t === "never") {
            unrecognized.push(key);
            continue;
        }
        const r = _catchall.run({ value: input[key], issues: [] }, ctx);
        if (r instanceof Promise) {
            proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
        }
        else {
            handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
        }
    }
    if (unrecognized.length) {
        payload.issues.push({
            code: "unrecognized_keys",
            keys: unrecognized,
            input,
            inst,
        });
    }
    if (!proms.length)
        return payload;
    return Promise.all(proms).then(() => {
        return payload;
    });
}
const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodType.init(inst, def);
    // const sh = def.shape;
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    if (!desc?.get) {
        const sh = def.shape;
        Object.defineProperty(def, "shape", {
            get: () => {
                const newSh = { ...sh };
                Object.defineProperty(def, "shape", {
                    value: newSh,
                });
                return newSh;
            },
        });
    }
    const _normalized = cached(() => normalizeDef(def));
    defineLazy(inst._zod, "propValues", () => {
        const shape = def.shape;
        const propValues = {};
        for (const key in shape) {
            const field = shape[key]._zod;
            if (field.values) {
                propValues[key] ?? (propValues[key] = new Set());
                for (const v of field.values)
                    propValues[key].add(v);
            }
        }
        return propValues;
    });
    const isObject = util_isObject;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = {};
        const proms = [];
        const shape = value.shape;
        for (const key of value.keys) {
            const el = shape[key];
            const isOptionalIn = el._zod.optin === "optional";
            const isOptionalOut = el._zod.optout === "optional";
            const r = el._zod.run({ value: input[key], issues: [] }, ctx);
            if (r instanceof Promise) {
                proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
            }
            else {
                handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
            }
        }
        if (!catchall) {
            return proms.length ? Promise.all(proms).then(() => payload) : payload;
        }
        return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
    };
});
const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodObject.init(inst, def);
    const superParse = inst._zod.parse;
    const _normalized = cached(() => normalizeDef(def));
    const generateFastpass = (shape) => {
        const doc = new Doc(["shape", "payload", "ctx"]);
        const normalized = _normalized.value;
        const parseStr = (key) => {
            const k = esc(key);
            return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
        };
        doc.write(`const input = payload.value;`);
        const ids = Object.create(null);
        let counter = 0;
        for (const key of normalized.keys) {
            ids[key] = `key_${counter++}`;
        }
        // A: preserve key order {
        doc.write(`const newResult = {};`);
        for (const key of normalized.keys) {
            const id = ids[key];
            const k = esc(key);
            const schema = shape[key];
            const isOptionalIn = schema?._zod?.optin === "optional";
            const isOptionalOut = schema?._zod?.optout === "optional";
            doc.write(`const ${id} = ${parseStr(key)};`);
            if (isOptionalIn && isOptionalOut) {
                // For optional-in/out schemas, ignore errors on absent keys
                doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }

        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
            }
            else if (!isOptionalIn) {
                doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
            }
            else {
                doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }

        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
            }
        }
        doc.write(`payload.value = newResult;`);
        doc.write(`return payload;`);
        const fn = doc.compile();
        return (payload, ctx) => fn(shape, payload, ctx);
    };
    let fastpass;
    const isObject = util_isObject;
    const jit = !globalConfig.jitless;
    const allowsEval = util_allowsEval;
    const fastEnabled = jit && allowsEval.value; // && !def.catchall;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
            // always synchronous
            if (!fastpass)
                fastpass = generateFastpass(def.shape);
            payload = fastpass(payload, ctx);
            if (!catchall)
                return payload;
            return handleCatchall([], input, payload, ctx, value, inst);
        }
        return superParse(payload, ctx);
    };
});
function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
        if (result.issues.length === 0) {
            final.value = result.value;
            return final;
        }
    }
    const nonaborted = results.filter((r) => !aborted(r));
    if (nonaborted.length === 1) {
        final.value = nonaborted[0].value;
        return nonaborted[0];
    }
    final.issues.push({
        code: "invalid_union",
        input: final.value,
        inst,
        errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
    });
    return final;
}
const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "values", () => {
        if (def.options.every((o) => o._zod.values)) {
            return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
        }
        return undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        if (def.options.every((o) => o._zod.pattern)) {
            const patterns = def.options.map((o) => o._zod.pattern);
            return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
        }
        return undefined;
    });
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
        if (first) {
            return first(payload, ctx);
        }
        let async = false;
        const results = [];
        for (const option of def.options) {
            const result = option._zod.run({
                value: payload.value,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                results.push(result);
                async = true;
            }
            else {
                if (result.issues.length === 0)
                    return result;
                results.push(result);
            }
        }
        if (!async)
            return handleUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results) => {
            return handleUnionResults(results, payload, inst, ctx);
        });
    };
});
function handleExclusiveUnionResults(results, final, inst, ctx) {
    const successes = results.filter((r) => r.issues.length === 0);
    if (successes.length === 1) {
        final.value = successes[0].value;
        return final;
    }
    if (successes.length === 0) {
        // No matches - same as regular union
        final.issues.push({
            code: "invalid_union",
            input: final.value,
            inst,
            errors: results.map((result) => result.issues.map((iss) => schemas_util.finalizeIssue(iss, ctx, schemas_core.config()))),
        });
    }
    else {
        // Multiple matches - exclusive union failure
        final.issues.push({
            code: "invalid_union",
            input: final.value,
            inst,
            errors: [],
            inclusive: false,
        });
    }
    return final;
}
const $ZodXor = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodXor", (inst, def) => {
    $ZodUnion.init(inst, def);
    def.inclusive = false;
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
        if (first) {
            return first(payload, ctx);
        }
        let async = false;
        const results = [];
        for (const option of def.options) {
            const result = option._zod.run({
                value: payload.value,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                results.push(result);
                async = true;
            }
            else {
                results.push(result);
            }
        }
        if (!async)
            return handleExclusiveUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results) => {
            return handleExclusiveUnionResults(results, payload, inst, ctx);
        });
    };
})));
const $ZodDiscriminatedUnion =
/*@__PURE__*/
(/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodDiscriminatedUnion", (inst, def) => {
    def.inclusive = false;
    $ZodUnion.init(inst, def);
    const _super = inst._zod.parse;
    schemas_util.defineLazy(inst._zod, "propValues", () => {
        const propValues = {};
        for (const option of def.options) {
            const pv = option._zod.propValues;
            if (!pv || Object.keys(pv).length === 0)
                throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
            for (const [k, v] of Object.entries(pv)) {
                if (!propValues[k])
                    propValues[k] = new Set();
                for (const val of v) {
                    propValues[k].add(val);
                }
            }
        }
        return propValues;
    });
    const disc = schemas_util.cached(() => {
        const opts = def.options;
        const map = new Map();
        for (const o of opts) {
            const values = o._zod.propValues?.[def.discriminator];
            if (!values || values.size === 0)
                throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
            for (const v of values) {
                if (map.has(v)) {
                    throw new Error(`Duplicate discriminator value "${String(v)}"`);
                }
                map.set(v, o);
            }
        }
        return map;
    });
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!schemas_util.isObject(input)) {
            payload.issues.push({
                code: "invalid_type",
                expected: "object",
                input,
                inst,
            });
            return payload;
        }
        const opt = disc.value.get(input?.[def.discriminator]);
        if (opt) {
            return opt._zod.run(payload, ctx);
        }
        // Fall back to union matching when the fast discriminator path fails:
        // - explicitly enabled via unionFallback, or
        // - during backward direction (encode), since codec-based discriminators
        //   have different values in forward vs backward directions
        if (def.unionFallback || ctx.direction === "backward") {
            return _super(payload, ctx);
        }
        // no matching discriminator
        payload.issues.push({
            code: "invalid_union",
            errors: [],
            note: "No matching discriminator",
            discriminator: def.discriminator,
            options: Array.from(disc.value.keys()),
            input,
            path: [def.discriminator],
            inst,
        });
        return payload;
    };
})));
const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        const left = def.left._zod.run({ value: input, issues: [] }, ctx);
        const right = def.right._zod.run({ value: input, issues: [] }, ctx);
        const async = left instanceof Promise || right instanceof Promise;
        if (async) {
            return Promise.all([left, right]).then(([left, right]) => {
                return handleIntersectionResults(payload, left, right);
            });
        }
        return handleIntersectionResults(payload, left, right);
    };
});
function mergeValues(a, b) {
    // const aType = parse.t(a);
    // const bType = parse.t(b);
    if (a === b) {
        return { valid: true, data: a };
    }
    if (a instanceof Date && b instanceof Date && +a === +b) {
        return { valid: true, data: a };
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const bKeys = Object.keys(b);
        const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
        const newObj = { ...a, ...b };
        for (const key of sharedKeys) {
            const sharedValue = mergeValues(a[key], b[key]);
            if (!sharedValue.valid) {
                return {
                    valid: false,
                    mergeErrorPath: [key, ...sharedValue.mergeErrorPath],
                };
            }
            newObj[key] = sharedValue.data;
        }
        return { valid: true, data: newObj };
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return { valid: false, mergeErrorPath: [] };
        }
        const newArray = [];
        for (let index = 0; index < a.length; index++) {
            const itemA = a[index];
            const itemB = b[index];
            const sharedValue = mergeValues(itemA, itemB);
            if (!sharedValue.valid) {
                return {
                    valid: false,
                    mergeErrorPath: [index, ...sharedValue.mergeErrorPath],
                };
            }
            newArray.push(sharedValue.data);
        }
        return { valid: true, data: newArray };
    }
    return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
    // Track which side(s) report each key as unrecognized
    const unrecKeys = new Map();
    let unrecIssue;
    for (const iss of left.issues) {
        if (iss.code === "unrecognized_keys") {
            unrecIssue ?? (unrecIssue = iss);
            for (const k of iss.keys) {
                if (!unrecKeys.has(k))
                    unrecKeys.set(k, {});
                unrecKeys.get(k).l = true;
            }
        }
        else {
            result.issues.push(iss);
        }
    }
    for (const iss of right.issues) {
        if (iss.code === "unrecognized_keys") {
            for (const k of iss.keys) {
                if (!unrecKeys.has(k))
                    unrecKeys.set(k, {});
                unrecKeys.get(k).r = true;
            }
        }
        else {
            result.issues.push(iss);
        }
    }
    // Report only keys unrecognized by BOTH sides
    const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
    if (bothKeys.length && unrecIssue) {
        result.issues.push({ ...unrecIssue, keys: bothKeys });
    }
    if (aborted(result))
        return result;
    const merged = mergeValues(left.value, right.value);
    if (!merged.valid) {
        throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
    }
    result.value = merged.data;
    return result;
}
const $ZodTuple = /*@__PURE__*/ $constructor("$ZodTuple", (inst, def) => {
    $ZodType.init(inst, def);
    const items = def.items;
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
            payload.issues.push({
                input,
                inst,
                expected: "tuple",
                code: "invalid_type",
            });
            return payload;
        }
        payload.value = [];
        const proms = [];
        const optinStart = getTupleOptStart(items, "optin");
        const optoutStart = getTupleOptStart(items, "optout");
        if (!def.rest) {
            if (input.length < optinStart) {
                payload.issues.push({
                    code: "too_small",
                    minimum: optinStart,
                    inclusive: true,
                    input,
                    inst,
                    origin: "array",
                });
                return payload;
            }
            if (input.length > items.length) {
                payload.issues.push({
                    code: "too_big",
                    maximum: items.length,
                    inclusive: true,
                    input,
                    inst,
                    origin: "array",
                });
            }
        }
        // Run every item in parallel, collecting results into an indexed
        // array. The post-processing in `handleTupleResults` walks them in
        // order so it can decide whether an absent optional-output error can
        // truncate the tail or must be reported to preserve required output.
        const itemResults = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
            const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
            if (r instanceof Promise) {
                proms.push(r.then((rr) => {
                    itemResults[i] = rr;
                }));
            }
            else {
                itemResults[i] = r;
            }
        }
        if (def.rest) {
            let i = items.length - 1;
            const rest = input.slice(items.length);
            for (const el of rest) {
                i++;
                const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
                if (result instanceof Promise) {
                    proms.push(result.then((r) => handleTupleResult(r, payload, i)));
                }
                else {
                    handleTupleResult(result, payload, i);
                }
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
        }
        return handleTupleResults(itemResults, payload, items, input, optoutStart);
    };
});
function getTupleOptStart(items, key) {
    for (let i = items.length - 1; i >= 0; i--) {
        if (items[i]._zod[key] !== "optional")
            return i + 1;
    }
    return 0;
}
function handleTupleResult(result, final, index) {
    if (result.issues.length) {
        final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
    // Walk results in order. Mirror $ZodObject's swallow-on-absent-optional
    // rule, but only after `optoutStart`: the first index where the output
    // tuple tail can be absent.
    for (let i = 0; i < items.length; i++) {
        const r = itemResults[i];
        const isPresent = i < input.length;
        if (r.issues.length) {
            if (!isPresent && i >= optoutStart) {
                final.value.length = i;
                break;
            }
            final.issues.push(...prefixIssues(i, r.issues));
        }
        final.value[i] = r.value;
    }
    // Drop trailing slots that produced `undefined` for absent input
    // (the array analog of an absent optional key on an object). The
    // `i >= input.length` floor is critical: an explicit `undefined`
    // *inside* the input must be preserved even when the schema is
    // optional-out (e.g. `z.string().or(z.undefined())` accepting an
    // explicit undefined value).
    for (let i = final.value.length - 1; i >= input.length; i--) {
        if (items[i]._zod.optout === "optional" && final.value[i] === undefined) {
            final.value.length = i;
        }
        else {
            break;
        }
    }
    return final;
}
const $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!isPlainObject(input)) {
            payload.issues.push({
                expected: "record",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        const proms = [];
        const values = def.keyType._zod.values;
        if (values) {
            payload.value = {};
            const recordKeys = new Set();
            for (const key of values) {
                if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
                    recordKeys.add(typeof key === "number" ? key.toString() : key);
                    const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
                    if (keyResult instanceof Promise) {
                        throw new Error("Async schemas not supported in object keys currently");
                    }
                    if (keyResult.issues.length) {
                        payload.issues.push({
                            code: "invalid_key",
                            origin: "record",
                            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                            input: key,
                            path: [key],
                            inst,
                        });
                        continue;
                    }
                    const outKey = keyResult.value;
                    const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
                    if (result instanceof Promise) {
                        proms.push(result.then((result) => {
                            if (result.issues.length) {
                                payload.issues.push(...prefixIssues(key, result.issues));
                            }
                            payload.value[outKey] = result.value;
                        }));
                    }
                    else {
                        if (result.issues.length) {
                            payload.issues.push(...prefixIssues(key, result.issues));
                        }
                        payload.value[outKey] = result.value;
                    }
                }
            }
            let unrecognized;
            for (const key in input) {
                if (!recordKeys.has(key)) {
                    unrecognized = unrecognized ?? [];
                    unrecognized.push(key);
                }
            }
            if (unrecognized && unrecognized.length > 0) {
                payload.issues.push({
                    code: "unrecognized_keys",
                    input,
                    inst,
                    keys: unrecognized,
                });
            }
        }
        else {
            payload.value = {};
            // Reflect.ownKeys for Symbol-key support; filter non-enumerable to match z.object()
            for (const key of Reflect.ownKeys(input)) {
                if (key === "__proto__")
                    continue;
                if (!Object.prototype.propertyIsEnumerable.call(input, key))
                    continue;
                let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
                if (keyResult instanceof Promise) {
                    throw new Error("Async schemas not supported in object keys currently");
                }
                // Numeric string fallback: if key is a numeric string and failed, retry with Number(key)
                // This handles z.number(), z.literal([1, 2, 3]), and unions containing numeric literals
                const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
                if (checkNumericKey) {
                    const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
                    if (retryResult instanceof Promise) {
                        throw new Error("Async schemas not supported in object keys currently");
                    }
                    if (retryResult.issues.length === 0) {
                        keyResult = retryResult;
                    }
                }
                if (keyResult.issues.length) {
                    if (def.mode === "loose") {
                        // Pass through unchanged
                        payload.value[key] = input[key];
                    }
                    else {
                        // Default "strict" behavior: error on invalid key
                        payload.issues.push({
                            code: "invalid_key",
                            origin: "record",
                            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                            input: key,
                            path: [key],
                            inst,
                        });
                    }
                    continue;
                }
                const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
                if (result instanceof Promise) {
                    proms.push(result.then((result) => {
                        if (result.issues.length) {
                            payload.issues.push(...prefixIssues(key, result.issues));
                        }
                        payload.value[keyResult.value] = result.value;
                    }));
                }
                else {
                    if (result.issues.length) {
                        payload.issues.push(...prefixIssues(key, result.issues));
                    }
                    payload.value[keyResult.value] = result.value;
                }
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload;
    };
});
const $ZodMap = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodMap", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!(input instanceof Map)) {
            payload.issues.push({
                expected: "map",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        const proms = [];
        payload.value = new Map();
        for (const [key, value] of input) {
            const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
            const valueResult = def.valueType._zod.run({ value: value, issues: [] }, ctx);
            if (keyResult instanceof Promise || valueResult instanceof Promise) {
                proms.push(Promise.all([keyResult, valueResult]).then(([keyResult, valueResult]) => {
                    handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
                }));
            }
            else {
                handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
            }
        }
        if (proms.length)
            return Promise.all(proms).then(() => payload);
        return payload;
    };
})));
function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
    if (keyResult.issues.length) {
        if (schemas_util.propertyKeyTypes.has(typeof key)) {
            final.issues.push(...schemas_util.prefixIssues(key, keyResult.issues));
        }
        else {
            final.issues.push({
                code: "invalid_key",
                origin: "map",
                input,
                inst,
                issues: keyResult.issues.map((iss) => schemas_util.finalizeIssue(iss, ctx, schemas_core.config())),
            });
        }
    }
    if (valueResult.issues.length) {
        if (schemas_util.propertyKeyTypes.has(typeof key)) {
            final.issues.push(...schemas_util.prefixIssues(key, valueResult.issues));
        }
        else {
            final.issues.push({
                origin: "map",
                code: "invalid_element",
                input,
                inst,
                key: key,
                issues: valueResult.issues.map((iss) => schemas_util.finalizeIssue(iss, ctx, schemas_core.config())),
            });
        }
    }
    final.value.set(keyResult.value, valueResult.value);
}
const $ZodSet = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodSet", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!(input instanceof Set)) {
            payload.issues.push({
                input,
                inst,
                expected: "set",
                code: "invalid_type",
            });
            return payload;
        }
        const proms = [];
        payload.value = new Set();
        for (const item of input) {
            const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
            if (result instanceof Promise) {
                proms.push(result.then((result) => handleSetResult(result, payload)));
            }
            else
                handleSetResult(result, payload);
        }
        if (proms.length)
            return Promise.all(proms).then(() => payload);
        return payload;
    };
})));
function handleSetResult(result, final) {
    if (result.issues.length) {
        final.issues.push(...result.issues);
    }
    final.value.add(result.value);
}
const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
    $ZodType.init(inst, def);
    const values = getEnumValues(def.entries);
    const valuesSet = new Set(values);
    inst._zod.values = valuesSet;
    inst._zod.pattern = new RegExp(`^(${values
        .filter((k) => propertyKeyTypes.has(typeof k))
        .map((o) => (typeof o === "string" ? escapeRegex(o) : o.toString()))
        .join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (valuesSet.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    if (def.values.length === 0) {
        throw new Error("Cannot create literal schema with no valid values");
    }
    const values = new Set(def.values);
    inst._zod.values = values;
    inst._zod.pattern = new RegExp(`^(${def.values
        .map((o) => (typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)))
        .join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (values.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values: def.values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodFile = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodFile", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        // @ts-ignore
        if (input instanceof File)
            return payload;
        payload.issues.push({
            expected: "file",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            throw new $ZodEncodeError(inst.constructor.name);
        }
        const _out = def.transform(payload.value, payload);
        if (ctx.async) {
            const output = _out instanceof Promise ? _out : Promise.resolve(_out);
            return output.then((output) => {
                payload.value = output;
                payload.fallback = true;
                return payload;
            });
        }
        if (_out instanceof Promise) {
            throw new $ZodAsyncError();
        }
        payload.value = _out;
        payload.fallback = true;
        return payload;
    };
});
function handleOptionalResult(result, input) {
    if (input === undefined && (result.issues.length || result.fallback)) {
        return { issues: [], value: undefined };
    }
    return result;
}
const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.optout = "optional";
    defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        const pattern = def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        if (def.innerType._zod.optin === "optional") {
            const input = payload.value;
            const result = def.innerType._zod.run(payload, ctx);
            if (result instanceof Promise)
                return result.then((r) => handleOptionalResult(r, input));
            return handleOptionalResult(result, input);
        }
        if (payload.value === undefined) {
            return payload;
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
    // Call parent init - inherits optin/optout = "optional"
    $ZodOptional.init(inst, def);
    // Override values/pattern to NOT add undefined
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
    // Override parse to just delegate (no undefined handling)
    inst._zod.parse = (payload, ctx) => {
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
    defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
    defineLazy(inst._zod, "pattern", () => {
        const pattern = def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
    });
    defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        // Forward direction (decode): allow null to pass through
        if (payload.value === null)
            return payload;
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
    $ZodType.init(inst, def);
    // inst._zod.qin = "true";
    inst._zod.optin = "optional";
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply defaults for undefined input
        if (payload.value === undefined) {
            payload.value = def.defaultValue;
            /**
             * $ZodDefault returns the default value immediately in forward direction.
             * It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
            return payload;
        }
        // Forward direction: continue with default handling
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => handleDefaultResult(result, def));
        }
        return handleDefaultResult(result, def);
    };
});
function handleDefaultResult(payload, def) {
    if (payload.value === undefined) {
        payload.value = def.defaultValue;
    }
    return payload;
}
const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply prefault for undefined input
        if (payload.value === undefined) {
            payload.value = def.defaultValue;
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "values", () => {
        const v = def.innerType._zod.values;
        return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => handleNonOptionalResult(result, inst));
        }
        return handleNonOptionalResult(result, inst);
    };
});
function handleNonOptionalResult(payload, inst) {
    if (!payload.issues.length && payload.value === undefined) {
        payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: payload.value,
            inst,
        });
    }
    return payload;
}
const $ZodSuccess = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodSuccess", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            throw new schemas_core.$ZodEncodeError("ZodSuccess");
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => {
                payload.value = result.issues.length === 0;
                return payload;
            });
        }
        payload.value = result.issues.length === 0;
        return payload;
    };
})));
const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply catch logic
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => {
                payload.value = result.value;
                if (result.issues.length) {
                    payload.value = def.catchValue({
                        ...payload,
                        error: {
                            issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                        },
                        input: payload.value,
                    });
                    payload.issues = [];
                    payload.fallback = true;
                }
                return payload;
            });
        }
        payload.value = result.value;
        if (result.issues.length) {
            payload.value = def.catchValue({
                ...payload,
                error: {
                    issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                },
                input: payload.value,
            });
            payload.issues = [];
            payload.fallback = true;
        }
        return payload;
    };
});
const $ZodNaN = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodNaN", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
            payload.issues.push({
                input: payload.value,
                inst,
                expected: "nan",
                code: "invalid_type",
            });
            return payload;
        }
        return payload;
    };
})));
const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "values", () => def.in._zod.values);
    defineLazy(inst._zod, "optin", () => def.in._zod.optin);
    defineLazy(inst._zod, "optout", () => def.out._zod.optout);
    defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            const right = def.out._zod.run(payload, ctx);
            if (right instanceof Promise) {
                return right.then((right) => handlePipeResult(right, def.in, ctx));
            }
            return handlePipeResult(right, def.in, ctx);
        }
        const left = def.in._zod.run(payload, ctx);
        if (left instanceof Promise) {
            return left.then((left) => handlePipeResult(left, def.out, ctx));
        }
        return handlePipeResult(left, def.out, ctx);
    };
});
function handlePipeResult(left, next, ctx) {
    if (left.issues.length) {
        // prevent further checks
        left.aborted = true;
        return left;
    }
    return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
const $ZodCodec = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodCodec", (inst, def) => {
    $ZodType.init(inst, def);
    schemas_util.defineLazy(inst._zod, "values", () => def.in._zod.values);
    schemas_util.defineLazy(inst._zod, "optin", () => def.in._zod.optin);
    schemas_util.defineLazy(inst._zod, "optout", () => def.out._zod.optout);
    schemas_util.defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
        const direction = ctx.direction || "forward";
        if (direction === "forward") {
            const left = def.in._zod.run(payload, ctx);
            if (left instanceof Promise) {
                return left.then((left) => handleCodecAResult(left, def, ctx));
            }
            return handleCodecAResult(left, def, ctx);
        }
        else {
            const right = def.out._zod.run(payload, ctx);
            if (right instanceof Promise) {
                return right.then((right) => handleCodecAResult(right, def, ctx));
            }
            return handleCodecAResult(right, def, ctx);
        }
    };
})));
function handleCodecAResult(result, def, ctx) {
    if (result.issues.length) {
        // prevent further checks
        result.aborted = true;
        return result;
    }
    const direction = ctx.direction || "forward";
    if (direction === "forward") {
        const transformed = def.transform(result.value, result);
        if (transformed instanceof Promise) {
            return transformed.then((value) => handleCodecTxResult(result, value, def.out, ctx));
        }
        return handleCodecTxResult(result, transformed, def.out, ctx);
    }
    else {
        const transformed = def.reverseTransform(result.value, result);
        if (transformed instanceof Promise) {
            return transformed.then((value) => handleCodecTxResult(result, value, def.in, ctx));
        }
        return handleCodecTxResult(result, transformed, def.in, ctx);
    }
}
function handleCodecTxResult(left, value, nextSchema, ctx) {
    // Check if transform added any issues
    if (left.issues.length) {
        left.aborted = true;
        return left;
    }
    return nextSchema._zod.run({ value, issues: left.issues }, ctx);
}
const $ZodPreprocess = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodPreprocess", (inst, def) => {
    $ZodPipe.init(inst, def);
})));
const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
    defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then(handleReadonlyResult);
        }
        return handleReadonlyResult(result);
    };
});
function handleReadonlyResult(payload) {
    payload.value = Object.freeze(payload.value);
    return payload;
}
const $ZodTemplateLiteral = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodTemplateLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    const regexParts = [];
    for (const part of def.parts) {
        if (typeof part === "object" && part !== null) {
            // is Zod schema
            if (!part._zod.pattern) {
                // if (!source)
                throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
            }
            const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
            if (!source)
                throw new Error(`Invalid template literal part: ${part._zod.traits}`);
            const start = source.startsWith("^") ? 1 : 0;
            const end = source.endsWith("$") ? source.length - 1 : source.length;
            regexParts.push(source.slice(start, end));
        }
        else if (part === null || schemas_util.primitiveTypes.has(typeof part)) {
            regexParts.push(schemas_util.escapeRegex(`${part}`));
        }
        else {
            throw new Error(`Invalid template literal part: ${part}`);
        }
    }
    inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
    inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "string") {
            payload.issues.push({
                input: payload.value,
                inst,
                expected: "string",
                code: "invalid_type",
            });
            return payload;
        }
        inst._zod.pattern.lastIndex = 0;
        if (!inst._zod.pattern.test(payload.value)) {
            payload.issues.push({
                input: payload.value,
                inst,
                code: "invalid_format",
                format: def.format ?? "template_literal",
                pattern: inst._zod.pattern.source,
            });
            return payload;
        }
        return payload;
    };
})));
const $ZodFunction = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodFunction", (inst, def) => {
    $ZodType.init(inst, def);
    inst._def = def;
    inst._zod.def = def;
    inst.implement = (func) => {
        if (typeof func !== "function") {
            throw new Error("implement() must be called with a function");
        }
        return function (...args) {
            const parsedArgs = inst._def.input ? schemas_parse(inst._def.input, args) : args;
            const result = Reflect.apply(func, this, parsedArgs);
            if (inst._def.output) {
                return schemas_parse(inst._def.output, result);
            }
            return result;
        };
    };
    inst.implementAsync = (func) => {
        if (typeof func !== "function") {
            throw new Error("implementAsync() must be called with a function");
        }
        return async function (...args) {
            const parsedArgs = inst._def.input ? await schemas_parseAsync(inst._def.input, args) : args;
            const result = await Reflect.apply(func, this, parsedArgs);
            if (inst._def.output) {
                return await schemas_parseAsync(inst._def.output, result);
            }
            return result;
        };
    };
    inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "function") {
            payload.issues.push({
                code: "invalid_type",
                expected: "function",
                input: payload.value,
                inst,
            });
            return payload;
        }
        // Check if output is a promise type to determine if we should use async implementation
        const hasPromiseOutput = inst._def.output && inst._def.output._zod.def.type === "promise";
        if (hasPromiseOutput) {
            payload.value = inst.implementAsync(payload.value);
        }
        else {
            payload.value = inst.implement(payload.value);
        }
        return payload;
    };
    inst.input = (...args) => {
        const F = inst.constructor;
        if (Array.isArray(args[0])) {
            return new F({
                type: "function",
                input: new $ZodTuple({
                    type: "tuple",
                    items: args[0],
                    rest: args[1],
                }),
                output: inst._def.output,
            });
        }
        return new F({
            type: "function",
            input: args[0],
            output: inst._def.output,
        });
    };
    inst.output = (output) => {
        const F = inst.constructor;
        return new F({
            type: "function",
            input: inst._def.input,
            output,
        });
    };
    return inst;
})));
const $ZodPromise = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodPromise", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
    };
})));
const $ZodLazy = /*@__PURE__*/ (/* unused pure expression or super */ null && (schemas_core.$constructor("$ZodLazy", (inst, def) => {
    $ZodType.init(inst, def);
    // Cache the resolved inner type on the shared `def` so all clones of this
    // lazy (e.g. via `.describe()`/`.meta()`) share the same inner instance,
    // preserving identity for cycle detection on recursive schemas.
    schemas_util.defineLazy(inst._zod, "innerType", () => {
        const d = def;
        if (!d._cachedInner)
            d._cachedInner = def.getter();
        return d._cachedInner;
    });
    schemas_util.defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
    schemas_util.defineLazy(inst._zod, "propValues", () => inst._zod.innerType?._zod?.propValues);
    schemas_util.defineLazy(inst._zod, "optin", () => inst._zod.innerType?._zod?.optin ?? undefined);
    schemas_util.defineLazy(inst._zod, "optout", () => inst._zod.innerType?._zod?.optout ?? undefined);
    inst._zod.parse = (payload, ctx) => {
        const inner = inst._zod.innerType;
        return inner._zod.run(payload, ctx);
    };
})));
const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
    $ZodCheck.init(inst, def);
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _) => {
        return payload;
    };
    inst._zod.check = (payload) => {
        const input = payload.value;
        const r = def.fn(input);
        if (r instanceof Promise) {
            return r.then((r) => handleRefineResult(r, payload, input, inst));
        }
        handleRefineResult(r, payload, input, inst);
        return;
    };
});
function handleRefineResult(result, payload, input, inst) {
    if (!result) {
        const _iss = {
            code: "custom",
            input,
            inst, // incorporates params.error into issue reporting
            path: [...(inst._zod.def.path ?? [])], // incorporates params.error into issue reporting
            continue: !inst._zod.def.abort,
            // params: inst._zod.def.params,
        };
        if (inst._zod.def.params)
            _iss.params = inst._zod.def.params;
        payload.issues.push(util_issue(_iss));
    }
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
var registries_a;
const $output = Symbol("ZodOutput");
const $input = Symbol("ZodInput");
class $ZodRegistry {
    constructor() {
        this._map = new WeakMap();
        this._idmap = new Map();
    }
    add(schema, ..._meta) {
        const meta = _meta[0];
        this._map.set(schema, meta);
        if (meta && typeof meta === "object" && "id" in meta) {
            this._idmap.set(meta.id, schema);
        }
        return this;
    }
    clear() {
        this._map = new WeakMap();
        this._idmap = new Map();
        return this;
    }
    remove(schema) {
        const meta = this._map.get(schema);
        if (meta && typeof meta === "object" && "id" in meta) {
            this._idmap.delete(meta.id);
        }
        this._map.delete(schema);
        return this;
    }
    get(schema) {
        // return this._map.get(schema) as any;
        // inherit metadata
        const p = schema._zod.parent;
        if (p) {
            const pm = { ...(this.get(p) ?? {}) };
            delete pm.id; // do not inherit id
            const f = { ...pm, ...this._map.get(schema) };
            return Object.keys(f).length ? f : undefined;
        }
        return this._map.get(schema);
    }
    has(schema) {
        return this._map.has(schema);
    }
}
// registries
function registry() {
    return new $ZodRegistry();
}
(registries_a = globalThis).__zod_globalRegistry ?? (registries_a.__zod_globalRegistry = registry());
const globalRegistry = globalThis.__zod_globalRegistry;

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
/* unused harmony import specifier */ var api_checks;
/* unused harmony import specifier */ var schemas;
/* unused harmony import specifier */ var api_util;




// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
    return new Class({
        type: "string",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedString(Class, params) {
    return new Class({
        type: "string",
        coerce: true,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
    return new Class({
        type: "string",
        format: "email",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
    return new Class({
        type: "string",
        format: "guid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        version: "v4",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        version: "v6",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        version: "v7",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
    return new Class({
        type: "string",
        format: "url",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function api_emoji(Class, params) {
    return new Class({
        type: "string",
        format: "emoji",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
    return new Class({
        type: "string",
        format: "nanoid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link _cuid2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
    return new Class({
        type: "string",
        format: "cuid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
    return new Class({
        type: "string",
        format: "cuid2",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
    return new Class({
        type: "string",
        format: "ulid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
    return new Class({
        type: "string",
        format: "xid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
    return new Class({
        type: "string",
        format: "ksuid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
    return new Class({
        type: "string",
        format: "ipv4",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
    return new Class({
        type: "string",
        format: "ipv6",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _mac(Class, params) {
    return new Class({
        type: "string",
        format: "mac",
        check: "string_format",
        abort: false,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
    return new Class({
        type: "string",
        format: "cidrv4",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
    return new Class({
        type: "string",
        format: "cidrv6",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
    return new Class({
        type: "string",
        format: "base64",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
    return new Class({
        type: "string",
        format: "base64url",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
    return new Class({
        type: "string",
        format: "e164",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
    return new Class({
        type: "string",
        format: "jwt",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
const TimePrecision = (/* unused pure expression or super */ null && ({
    Any: null,
    Minute: -1,
    Second: 0,
    Millisecond: 3,
    Microsecond: 6,
}));
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
    return new Class({
        type: "string",
        format: "datetime",
        check: "string_format",
        offset: false,
        local: false,
        precision: null,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
    return new Class({
        type: "string",
        format: "date",
        check: "string_format",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
    return new Class({
        type: "string",
        format: "time",
        check: "string_format",
        precision: null,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
    return new Class({
        type: "string",
        format: "duration",
        check: "string_format",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
    return new Class({
        type: "number",
        checks: [],
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedNumber(Class, params) {
    return new Class({
        type: "number",
        coerce: true,
        checks: [],
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "safeint",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _float32(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "float32",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _float64(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "float64",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _int32(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "int32",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uint32(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "uint32",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
    return new Class({
        type: "boolean",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedBoolean(Class, params) {
    return new Class({
        type: "boolean",
        coerce: true,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _bigint(Class, params) {
    return new Class({
        type: "bigint",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedBigint(Class, params) {
    return new Class({
        type: "bigint",
        coerce: true,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _int64(Class, params) {
    return new Class({
        type: "bigint",
        check: "bigint_format",
        abort: false,
        format: "int64",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uint64(Class, params) {
    return new Class({
        type: "bigint",
        check: "bigint_format",
        abort: false,
        format: "uint64",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _symbol(Class, params) {
    return new Class({
        type: "symbol",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function api_undefined(Class, params) {
    return new Class({
        type: "undefined",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function api_null(Class, params) {
    return new Class({
        type: "null",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _any(Class) {
    return new Class({
        type: "any",
    });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
    return new Class({
        type: "unknown",
    });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
    return new Class({
        type: "never",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _void(Class, params) {
    return new Class({
        type: "void",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _date(Class, params) {
    return new Class({
        type: "date",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedDate(Class, params) {
    return new Class({
        type: "date",
        coerce: true,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _nan(Class, params) {
    return new Class({
        type: "nan",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
    return new $ZodCheckLessThan({
        check: "less_than",
        ...normalizeParams(params),
        value,
        inclusive: false,
    });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
    return new $ZodCheckLessThan({
        check: "less_than",
        ...normalizeParams(params),
        value,
        inclusive: true,
    });
}

// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
    return new $ZodCheckGreaterThan({
        check: "greater_than",
        ...normalizeParams(params),
        value,
        inclusive: false,
    });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
    return new $ZodCheckGreaterThan({
        check: "greater_than",
        ...normalizeParams(params),
        value,
        inclusive: true,
    });
}

// @__NO_SIDE_EFFECTS__
function _positive(params) {
    return _gt(0, params);
}
// negative
// @__NO_SIDE_EFFECTS__
function _negative(params) {
    return _lt(0, params);
}
// nonpositive
// @__NO_SIDE_EFFECTS__
function _nonpositive(params) {
    return _lte(0, params);
}
// nonnegative
// @__NO_SIDE_EFFECTS__
function _nonnegative(params) {
    return _gte(0, params);
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
    return new $ZodCheckMultipleOf({
        check: "multiple_of",
        ...normalizeParams(params),
        value,
    });
}
// @__NO_SIDE_EFFECTS__
function _maxSize(maximum, params) {
    return new api_checks.$ZodCheckMaxSize({
        check: "max_size",
        ...api_util.normalizeParams(params),
        maximum,
    });
}
// @__NO_SIDE_EFFECTS__
function _minSize(minimum, params) {
    return new api_checks.$ZodCheckMinSize({
        check: "min_size",
        ...api_util.normalizeParams(params),
        minimum,
    });
}
// @__NO_SIDE_EFFECTS__
function _size(size, params) {
    return new api_checks.$ZodCheckSizeEquals({
        check: "size_equals",
        ...api_util.normalizeParams(params),
        size,
    });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
    const ch = new $ZodCheckMaxLength({
        check: "max_length",
        ...normalizeParams(params),
        maximum,
    });
    return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
    return new $ZodCheckMinLength({
        check: "min_length",
        ...normalizeParams(params),
        minimum,
    });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
    return new $ZodCheckLengthEquals({
        check: "length_equals",
        ...normalizeParams(params),
        length,
    });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
    return new $ZodCheckRegex({
        check: "string_format",
        format: "regex",
        ...normalizeParams(params),
        pattern,
    });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
    return new $ZodCheckLowerCase({
        check: "string_format",
        format: "lowercase",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
    return new $ZodCheckUpperCase({
        check: "string_format",
        format: "uppercase",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
    return new $ZodCheckIncludes({
        check: "string_format",
        format: "includes",
        ...normalizeParams(params),
        includes,
    });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
    return new $ZodCheckStartsWith({
        check: "string_format",
        format: "starts_with",
        ...normalizeParams(params),
        prefix,
    });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
    return new $ZodCheckEndsWith({
        check: "string_format",
        format: "ends_with",
        ...normalizeParams(params),
        suffix,
    });
}
// @__NO_SIDE_EFFECTS__
function _property(property, schema, params) {
    return new api_checks.$ZodCheckProperty({
        check: "property",
        property,
        schema,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _mime(types, params) {
    return new api_checks.$ZodCheckMimeType({
        check: "mime_type",
        mime: types,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
    return new $ZodCheckOverwrite({
        check: "overwrite",
        tx,
    });
}
// normalize
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
    return _overwrite((input) => input.normalize(form));
}
// trim
// @__NO_SIDE_EFFECTS__
function _trim() {
    return _overwrite((input) => input.trim());
}
// toLowerCase
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
    return _overwrite((input) => input.toLowerCase());
}
// toUpperCase
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
    return _overwrite((input) => input.toUpperCase());
}
// slugify
// @__NO_SIDE_EFFECTS__
function _slugify() {
    return _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
    return new Class({
        type: "array",
        element,
        // get element() {
        //   return element;
        // },
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _union(Class, options, params) {
    return new Class({
        type: "union",
        options,
        ...api_util.normalizeParams(params),
    });
}
function _xor(Class, options, params) {
    return new Class({
        type: "union",
        options,
        inclusive: false,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _discriminatedUnion(Class, discriminator, options, params) {
    return new Class({
        type: "union",
        options,
        discriminator,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _intersection(Class, left, right) {
    return new Class({
        type: "intersection",
        left,
        right,
    });
}
// export function _tuple(
//   Class: util.SchemaClass<schemas.$ZodTuple>,
//   items: [],
//   params?: string | $ZodTupleParams
// ): schemas.$ZodTuple<[], null>;
// @__NO_SIDE_EFFECTS__
function _tuple(Class, items, _paramsOrRest, _params) {
    const hasRest = _paramsOrRest instanceof schemas.$ZodType;
    const params = hasRest ? _params : _paramsOrRest;
    const rest = hasRest ? _paramsOrRest : null;
    return new Class({
        type: "tuple",
        items,
        rest,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _record(Class, keyType, valueType, params) {
    return new Class({
        type: "record",
        keyType,
        valueType,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _map(Class, keyType, valueType, params) {
    return new Class({
        type: "map",
        keyType,
        valueType,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _set(Class, valueType, params) {
    return new Class({
        type: "set",
        valueType,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _enum(Class, values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    // if (Array.isArray(values)) {
    //   for (const value of values) {
    //     entries[value] = value;
    //   }
    // } else {
    //   Object.assign(entries, values);
    // }
    // const entries: util.EnumLike = {};
    // for (const val of values) {
    //   entries[val] = val;
    // }
    return new Class({
        type: "enum",
        entries,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
/** @deprecated This API has been merged into `z.enum()`. Use `z.enum()` instead.
 *
 * ```ts
 * enum Colors { red, green, blue }
 * z.enum(Colors);
 * ```
 */
function _nativeEnum(Class, entries, params) {
    return new Class({
        type: "enum",
        entries,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _literal(Class, value, params) {
    return new Class({
        type: "literal",
        values: Array.isArray(value) ? value : [value],
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _file(Class, params) {
    return new Class({
        type: "file",
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _transform(Class, fn) {
    return new Class({
        type: "transform",
        transform: fn,
    });
}
// @__NO_SIDE_EFFECTS__
function _optional(Class, innerType) {
    return new Class({
        type: "optional",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _nullable(Class, innerType) {
    return new Class({
        type: "nullable",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _default(Class, innerType, defaultValue) {
    return new Class({
        type: "default",
        innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : api_util.shallowClone(defaultValue);
        },
    });
}
// @__NO_SIDE_EFFECTS__
function _nonoptional(Class, innerType, params) {
    return new Class({
        type: "nonoptional",
        innerType,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _success(Class, innerType) {
    return new Class({
        type: "success",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _catch(Class, innerType, catchValue) {
    return new Class({
        type: "catch",
        innerType,
        catchValue: (typeof catchValue === "function" ? catchValue : () => catchValue),
    });
}
// @__NO_SIDE_EFFECTS__
function _pipe(Class, in_, out) {
    return new Class({
        type: "pipe",
        in: in_,
        out,
    });
}
// @__NO_SIDE_EFFECTS__
function _readonly(Class, innerType) {
    return new Class({
        type: "readonly",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _templateLiteral(Class, parts, params) {
    return new Class({
        type: "template_literal",
        parts,
        ...api_util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _lazy(Class, getter) {
    return new Class({
        type: "lazy",
        getter,
    });
}
// @__NO_SIDE_EFFECTS__
function _promise(Class, innerType) {
    return new Class({
        type: "promise",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _custom(Class, fn, _params) {
    const norm = api_util.normalizeParams(_params);
    norm.abort ?? (norm.abort = true); // default to abort:false
    const schema = new Class({
        type: "custom",
        check: "custom",
        fn: fn,
        ...norm,
    });
    return schema;
}
// same as _custom but defaults to abort:false
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
    const schema = new Class({
        type: "custom",
        check: "custom",
        fn: fn,
        ...normalizeParams(_params),
    });
    return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
    const ch = _check((payload) => {
        payload.addIssue = (issue) => {
            if (typeof issue === "string") {
                payload.issues.push(util_issue(issue, payload.value, ch._zod.def));
            }
            else {
                // for Zod 3 backwards compatibility
                const _issue = issue;
                if (_issue.fatal)
                    _issue.continue = false;
                _issue.code ?? (_issue.code = "custom");
                _issue.input ?? (_issue.input = payload.value);
                _issue.inst ?? (_issue.inst = ch);
                _issue.continue ?? (_issue.continue = !ch._zod.def.abort); // abort is always undefined, so this is always true...
                payload.issues.push(util_issue(_issue));
            }
        };
        return fn(payload.value, payload);
    }, params);
    return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
    const ch = new $ZodCheck({
        check: "custom",
        ...normalizeParams(params),
    });
    ch._zod.check = fn;
    return ch;
}
// @__NO_SIDE_EFFECTS__
function describe(description) {
    const ch = new $ZodCheck({ check: "describe" });
    ch._zod.onattach = [
        (inst) => {
            const existing = globalRegistry.get(inst) ?? {};
            globalRegistry.add(inst, { ...existing, description });
        },
    ];
    ch._zod.check = () => { }; // no-op check
    return ch;
}
// @__NO_SIDE_EFFECTS__
function meta(metadata) {
    const ch = new $ZodCheck({ check: "meta" });
    ch._zod.onattach = [
        (inst) => {
            const existing = globalRegistry.get(inst) ?? {};
            globalRegistry.add(inst, { ...existing, ...metadata });
        },
    ];
    ch._zod.check = () => { }; // no-op check
    return ch;
}
// @__NO_SIDE_EFFECTS__
function _stringbool(Classes, _params) {
    const params = api_util.normalizeParams(_params);
    let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
    let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
    if (params.case !== "sensitive") {
        truthyArray = truthyArray.map((v) => (typeof v === "string" ? v.toLowerCase() : v));
        falsyArray = falsyArray.map((v) => (typeof v === "string" ? v.toLowerCase() : v));
    }
    const truthySet = new Set(truthyArray);
    const falsySet = new Set(falsyArray);
    const _Codec = Classes.Codec ?? schemas.$ZodCodec;
    const _Boolean = Classes.Boolean ?? schemas.$ZodBoolean;
    const _String = Classes.String ?? schemas.$ZodString;
    const stringSchema = new _String({ type: "string", error: params.error });
    const booleanSchema = new _Boolean({ type: "boolean", error: params.error });
    const codec = new _Codec({
        type: "pipe",
        in: stringSchema,
        out: booleanSchema,
        transform: ((input, payload) => {
            let data = input;
            if (params.case !== "sensitive")
                data = data.toLowerCase();
            if (truthySet.has(data)) {
                return true;
            }
            else if (falsySet.has(data)) {
                return false;
            }
            else {
                payload.issues.push({
                    code: "invalid_value",
                    expected: "stringbool",
                    values: [...truthySet, ...falsySet],
                    input: payload.value,
                    inst: codec,
                    continue: false,
                });
                return {};
            }
        }),
        reverseTransform: ((input, _payload) => {
            if (input === true) {
                return truthyArray[0] || "true";
            }
            else {
                return falsyArray[0] || "false";
            }
        }),
        error: params.error,
    });
    return codec;
}
// @__NO_SIDE_EFFECTS__
function _stringFormat(Class, format, fnOrRegex, _params = {}) {
    const params = api_util.normalizeParams(_params);
    const def = {
        ...api_util.normalizeParams(_params),
        check: "string_format",
        type: "string",
        format,
        fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
        ...params,
    };
    if (fnOrRegex instanceof RegExp) {
        def.pattern = fnOrRegex;
    }
    const inst = new Class(def);
    return inst;
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js

// function initializeContext<T extends schemas.$ZodType>(inputs: JSONSchemaGeneratorParams<T>): ToJSONSchemaContext<T> {
//   return {
//     processor: inputs.processor,
//     metadataRegistry: inputs.metadata ?? globalRegistry,
//     target: inputs.target ?? "draft-2020-12",
//     unrepresentable: inputs.unrepresentable ?? "throw",
//   };
// }
function initializeContext(params) {
    // Normalize target: convert old non-hyphenated versions to hyphenated versions
    let target = params?.target ?? "draft-2020-12";
    if (target === "draft-4")
        target = "draft-04";
    if (target === "draft-7")
        target = "draft-07";
    return {
        processors: params.processors ?? {},
        metadataRegistry: params?.metadata ?? globalRegistry,
        target,
        unrepresentable: params?.unrepresentable ?? "throw",
        override: params?.override ?? (() => { }),
        io: params?.io ?? "output",
        counter: 0,
        seen: new Map(),
        cycles: params?.cycles ?? "ref",
        reused: params?.reused ?? "inline",
        external: params?.external ?? undefined,
    };
}
function process(schema, ctx, _params = { path: [], schemaPath: [] }) {
    var _a;
    const def = schema._zod.def;
    // check for schema in seens
    const seen = ctx.seen.get(schema);
    if (seen) {
        seen.count++;
        // check if cycle
        const isCycle = _params.schemaPath.includes(schema);
        if (isCycle) {
            seen.cycle = _params.path;
        }
        return seen.schema;
    }
    // initialize
    const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
    ctx.seen.set(schema, result);
    // custom method overrides default behavior
    const overrideSchema = schema._zod.toJSONSchema?.();
    if (overrideSchema) {
        result.schema = overrideSchema;
    }
    else {
        const params = {
            ..._params,
            schemaPath: [..._params.schemaPath, schema],
            path: _params.path,
        };
        if (schema._zod.processJSONSchema) {
            schema._zod.processJSONSchema(ctx, result.schema, params);
        }
        else {
            const _json = result.schema;
            const processor = ctx.processors[def.type];
            if (!processor) {
                throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
            }
            processor(schema, ctx, _json, params);
        }
        const parent = schema._zod.parent;
        if (parent) {
            // Also set ref if processor didn't (for inheritance)
            if (!result.ref)
                result.ref = parent;
            process(parent, ctx, params);
            ctx.seen.get(parent).isParent = true;
        }
    }
    // metadata
    const meta = ctx.metadataRegistry.get(schema);
    if (meta)
        Object.assign(result.schema, meta);
    if (ctx.io === "input" && isTransforming(schema)) {
        // examples/defaults only apply to output type of pipe
        delete result.schema.examples;
        delete result.schema.default;
    }
    // set prefault as default
    if (ctx.io === "input" && "_prefault" in result.schema)
        (_a = result.schema).default ?? (_a.default = result.schema._prefault);
    delete result.schema._prefault;
    // pulling fresh from ctx.seen in case it was overwritten
    const _result = ctx.seen.get(schema);
    return _result.schema;
}
function extractDefs(ctx, schema
// params: EmitParams
) {
    // iterate over seen map;
    const root = ctx.seen.get(schema);
    if (!root)
        throw new Error("Unprocessed schema. This is a bug in Zod.");
    // Track ids to detect duplicates across different schemas
    const idToSchema = new Map();
    for (const entry of ctx.seen.entries()) {
        const id = ctx.metadataRegistry.get(entry[0])?.id;
        if (id) {
            const existing = idToSchema.get(id);
            if (existing && existing !== entry[0]) {
                throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
            }
            idToSchema.set(id, entry[0]);
        }
    }
    // returns a ref to the schema
    // defId will be empty if the ref points to an external schema (or #)
    const makeURI = (entry) => {
        // comparing the seen objects because sometimes
        // multiple schemas map to the same seen object.
        // e.g. lazy
        // external is configured
        const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
        if (ctx.external) {
            const externalId = ctx.external.registry.get(entry[0])?.id; // ?? "__shared";// `__schema${ctx.counter++}`;
            // check if schema is in the external registry
            const uriGenerator = ctx.external.uri ?? ((id) => id);
            if (externalId) {
                return { ref: uriGenerator(externalId) };
            }
            // otherwise, add to __shared
            const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
            entry[1].defId = id; // set defId so it will be reused if needed
            return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
        }
        if (entry[1] === root) {
            return { ref: "#" };
        }
        // self-contained schema
        const uriPrefix = `#`;
        const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
        const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
        return { defId, ref: defUriPrefix + defId };
    };
    // stored cached version in `def` property
    // remove all properties, set $ref
    const extractToDef = (entry) => {
        // if the schema is already a reference, do not extract it
        if (entry[1].schema.$ref) {
            return;
        }
        const seen = entry[1];
        const { ref, defId } = makeURI(entry);
        seen.def = { ...seen.schema };
        // defId won't be set if the schema is a reference to an external schema
        // or if the schema is the root schema
        if (defId)
            seen.defId = defId;
        // wipe away all properties except $ref
        const schema = seen.schema;
        for (const key in schema) {
            delete schema[key];
        }
        schema.$ref = ref;
    };
    // throw on cycles
    // break cycles
    if (ctx.cycles === "throw") {
        for (const entry of ctx.seen.entries()) {
            const seen = entry[1];
            if (seen.cycle) {
                throw new Error("Cycle detected: " +
                    `#/${seen.cycle?.join("/")}/<root>` +
                    '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
            }
        }
    }
    // extract schemas into $defs
    for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        // convert root schema to # $ref
        if (schema === entry[0]) {
            extractToDef(entry); // this has special handling for the root schema
            continue;
        }
        // extract schemas that are in the external registry
        if (ctx.external) {
            const ext = ctx.external.registry.get(entry[0])?.id;
            if (schema !== entry[0] && ext) {
                extractToDef(entry);
                continue;
            }
        }
        // extract schemas with `id` meta
        const id = ctx.metadataRegistry.get(entry[0])?.id;
        if (id) {
            extractToDef(entry);
            continue;
        }
        // break cycles
        if (seen.cycle) {
            // any
            extractToDef(entry);
            continue;
        }
        // extract reused schemas
        if (seen.count > 1) {
            if (ctx.reused === "ref") {
                extractToDef(entry);
                // biome-ignore lint:
                continue;
            }
        }
    }
}
function finalize(ctx, schema) {
    const root = ctx.seen.get(schema);
    if (!root)
        throw new Error("Unprocessed schema. This is a bug in Zod.");
    // flatten refs - inherit properties from parent schemas
    const flattenRef = (zodSchema) => {
        const seen = ctx.seen.get(zodSchema);
        // already processed
        if (seen.ref === null)
            return;
        const schema = seen.def ?? seen.schema;
        const _cached = { ...schema };
        const ref = seen.ref;
        seen.ref = null; // prevent infinite recursion
        if (ref) {
            flattenRef(ref);
            const refSeen = ctx.seen.get(ref);
            const refSchema = refSeen.schema;
            // merge referenced schema into current
            if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
                // older drafts can't combine $ref with other properties
                schema.allOf = schema.allOf ?? [];
                schema.allOf.push(refSchema);
            }
            else {
                Object.assign(schema, refSchema);
            }
            // restore child's own properties (child wins)
            Object.assign(schema, _cached);
            const isParentRef = zodSchema._zod.parent === ref;
            // For parent chain, child is a refinement - remove parent-only properties
            if (isParentRef) {
                for (const key in schema) {
                    if (key === "$ref" || key === "allOf")
                        continue;
                    if (!(key in _cached)) {
                        delete schema[key];
                    }
                }
            }
            // When ref was extracted to $defs, remove properties that match the definition
            if (refSchema.$ref && refSeen.def) {
                for (const key in schema) {
                    if (key === "$ref" || key === "allOf")
                        continue;
                    if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) {
                        delete schema[key];
                    }
                }
            }
        }
        // If parent was extracted (has $ref), propagate $ref to this schema
        // This handles cases like: readonly().meta({id}).describe()
        // where processor sets ref to innerType but parent should be referenced
        const parent = zodSchema._zod.parent;
        if (parent && parent !== ref) {
            // Ensure parent is processed first so its def has inherited properties
            flattenRef(parent);
            const parentSeen = ctx.seen.get(parent);
            if (parentSeen?.schema.$ref) {
                schema.$ref = parentSeen.schema.$ref;
                // De-duplicate with parent's definition
                if (parentSeen.def) {
                    for (const key in schema) {
                        if (key === "$ref" || key === "allOf")
                            continue;
                        if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) {
                            delete schema[key];
                        }
                    }
                }
            }
        }
        // execute overrides
        ctx.override({
            zodSchema: zodSchema,
            jsonSchema: schema,
            path: seen.path ?? [],
        });
    };
    for (const entry of [...ctx.seen.entries()].reverse()) {
        flattenRef(entry[0]);
    }
    const result = {};
    if (ctx.target === "draft-2020-12") {
        result.$schema = "https://json-schema.org/draft/2020-12/schema";
    }
    else if (ctx.target === "draft-07") {
        result.$schema = "http://json-schema.org/draft-07/schema#";
    }
    else if (ctx.target === "draft-04") {
        result.$schema = "http://json-schema.org/draft-04/schema#";
    }
    else if (ctx.target === "openapi-3.0") {
        // OpenAPI 3.0 schema objects should not include a $schema property
    }
    else {
        // Arbitrary string values are allowed but won't have a $schema property set
    }
    if (ctx.external?.uri) {
        const id = ctx.external.registry.get(schema)?.id;
        if (!id)
            throw new Error("Schema is missing an `id` property");
        result.$id = ctx.external.uri(id);
    }
    Object.assign(result, root.def ?? root.schema);
    // The `id` in `.meta()` is a Zod-specific registration tag used to extract
    // schemas into $defs — it is not user-facing JSON Schema metadata. Strip it
    // from the output body where it would otherwise leak. The id is preserved
    // implicitly via the $defs key (and via $ref paths).
    const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
    if (rootMetaId !== undefined && result.id === rootMetaId)
        delete result.id;
    // build defs object
    const defs = ctx.external?.defs ?? {};
    for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        if (seen.def && seen.defId) {
            if (seen.def.id === seen.defId)
                delete seen.def.id;
            defs[seen.defId] = seen.def;
        }
    }
    // set definitions in result
    if (ctx.external) {
    }
    else {
        if (Object.keys(defs).length > 0) {
            if (ctx.target === "draft-2020-12") {
                result.$defs = defs;
            }
            else {
                result.definitions = defs;
            }
        }
    }
    try {
        // this "finalizes" this schema and ensures all cycles are removed
        // each call to finalize() is functionally independent
        // though the seen map is shared
        const finalized = JSON.parse(JSON.stringify(result));
        Object.defineProperty(finalized, "~standard", {
            value: {
                ...schema["~standard"],
                jsonSchema: {
                    input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
                    output: createStandardJSONSchemaMethod(schema, "output", ctx.processors),
                },
            },
            enumerable: false,
            writable: false,
        });
        return finalized;
    }
    catch (_err) {
        throw new Error("Error converting schema to JSON.");
    }
}
function isTransforming(_schema, _ctx) {
    const ctx = _ctx ?? { seen: new Set() };
    if (ctx.seen.has(_schema))
        return false;
    ctx.seen.add(_schema);
    const def = _schema._zod.def;
    if (def.type === "transform")
        return true;
    if (def.type === "array")
        return isTransforming(def.element, ctx);
    if (def.type === "set")
        return isTransforming(def.valueType, ctx);
    if (def.type === "lazy")
        return isTransforming(def.getter(), ctx);
    if (def.type === "promise" ||
        def.type === "optional" ||
        def.type === "nonoptional" ||
        def.type === "nullable" ||
        def.type === "readonly" ||
        def.type === "default" ||
        def.type === "prefault") {
        return isTransforming(def.innerType, ctx);
    }
    if (def.type === "intersection") {
        return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
    }
    if (def.type === "record" || def.type === "map") {
        return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    if (def.type === "pipe") {
        if (_schema._zod.traits.has("$ZodCodec"))
            return true;
        return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
    }
    if (def.type === "object") {
        for (const key in def.shape) {
            if (isTransforming(def.shape[key], ctx))
                return true;
        }
        return false;
    }
    if (def.type === "union") {
        for (const option of def.options) {
            if (isTransforming(option, ctx))
                return true;
        }
        return false;
    }
    if (def.type === "tuple") {
        for (const item of def.items) {
            if (isTransforming(item, ctx))
                return true;
        }
        if (def.rest && isTransforming(def.rest, ctx))
            return true;
        return false;
    }
    return false;
}
/**
 * Creates a toJSONSchema method for a schema instance.
 * This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
 */
const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
    const ctx = initializeContext({ ...params, processors });
    process(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
};
const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
    const { libraryOptions, target } = params ?? {};
    const ctx = initializeContext({ ...(libraryOptions ?? {}), target, io, processors });
    process(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
};

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
/* unused harmony import specifier */ var json_schema_processors_process;
/* unused harmony import specifier */ var json_schema_processors_initializeContext;
/* unused harmony import specifier */ var json_schema_processors_extractDefs;
/* unused harmony import specifier */ var json_schema_processors_finalize;


const formatMap = {
    guid: "uuid",
    url: "uri",
    datetime: "date-time",
    json_string: "json-string",
    regex: "", // do not set
};
// ==================== SIMPLE TYPE PROCESSORS ====================
const stringProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    json.type = "string";
    const { minimum, maximum, format, patterns, contentEncoding } = schema._zod
        .bag;
    if (typeof minimum === "number")
        json.minLength = minimum;
    if (typeof maximum === "number")
        json.maxLength = maximum;
    // custom pattern overrides format
    if (format) {
        json.format = formatMap[format] ?? format;
        if (json.format === "")
            delete json.format; // empty format is not valid
        // JSON Schema format: "time" requires a full time with offset or Z
        // z.iso.time() does not include timezone information, so format: "time" should never be used
        if (format === "time") {
            delete json.format;
        }
    }
    if (contentEncoding)
        json.contentEncoding = contentEncoding;
    if (patterns && patterns.size > 0) {
        const regexes = [...patterns];
        if (regexes.length === 1)
            json.pattern = regexes[0].source;
        else if (regexes.length > 1) {
            json.allOf = [
                ...regexes.map((regex) => ({
                    ...(ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0"
                        ? { type: "string" }
                        : {}),
                    pattern: regex.source,
                })),
            ];
        }
    }
};
const numberProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
    if (typeof format === "string" && format.includes("int"))
        json.type = "integer";
    else
        json.type = "number";
    // when both minimum and exclusiveMinimum exist, pick the more restrictive one
    const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
    const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
    const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
    if (exMin) {
        if (legacy) {
            json.minimum = exclusiveMinimum;
            json.exclusiveMinimum = true;
        }
        else {
            json.exclusiveMinimum = exclusiveMinimum;
        }
    }
    else if (typeof minimum === "number") {
        json.minimum = minimum;
    }
    if (exMax) {
        if (legacy) {
            json.maximum = exclusiveMaximum;
            json.exclusiveMaximum = true;
        }
        else {
            json.exclusiveMaximum = exclusiveMaximum;
        }
    }
    else if (typeof maximum === "number") {
        json.maximum = maximum;
    }
    if (typeof multipleOf === "number")
        json.multipleOf = multipleOf;
};
const booleanProcessor = (_schema, _ctx, json, _params) => {
    json.type = "boolean";
};
const bigintProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt cannot be represented in JSON Schema");
    }
};
const symbolProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Symbols cannot be represented in JSON Schema");
    }
};
const nullProcessor = (_schema, ctx, json, _params) => {
    if (ctx.target === "openapi-3.0") {
        json.type = "string";
        json.nullable = true;
        json.enum = [null];
    }
    else {
        json.type = "null";
    }
};
const undefinedProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Undefined cannot be represented in JSON Schema");
    }
};
const voidProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Void cannot be represented in JSON Schema");
    }
};
const neverProcessor = (_schema, _ctx, json, _params) => {
    json.not = {};
};
const anyProcessor = (_schema, _ctx, _json, _params) => {
    // empty schema accepts anything
};
const unknownProcessor = (_schema, _ctx, _json, _params) => {
    // empty schema accepts anything
};
const dateProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Date cannot be represented in JSON Schema");
    }
};
const enumProcessor = (schema, _ctx, json, _params) => {
    const def = schema._zod.def;
    const values = getEnumValues(def.entries);
    // Number enums can have both string and number values
    if (values.every((v) => typeof v === "number"))
        json.type = "number";
    if (values.every((v) => typeof v === "string"))
        json.type = "string";
    json.enum = values;
};
const literalProcessor = (schema, ctx, json, _params) => {
    const def = schema._zod.def;
    const vals = [];
    for (const val of def.values) {
        if (val === undefined) {
            if (ctx.unrepresentable === "throw") {
                throw new Error("Literal `undefined` cannot be represented in JSON Schema");
            }
            else {
                // do not add to vals
            }
        }
        else if (typeof val === "bigint") {
            if (ctx.unrepresentable === "throw") {
                throw new Error("BigInt literals cannot be represented in JSON Schema");
            }
            else {
                vals.push(Number(val));
            }
        }
        else {
            vals.push(val);
        }
    }
    if (vals.length === 0) {
        // do nothing (an undefined literal was stripped)
    }
    else if (vals.length === 1) {
        const val = vals[0];
        json.type = val === null ? "null" : typeof val;
        if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
            json.enum = [val];
        }
        else {
            json.const = val;
        }
    }
    else {
        if (vals.every((v) => typeof v === "number"))
            json.type = "number";
        if (vals.every((v) => typeof v === "string"))
            json.type = "string";
        if (vals.every((v) => typeof v === "boolean"))
            json.type = "boolean";
        if (vals.every((v) => v === null))
            json.type = "null";
        json.enum = vals;
    }
};
const nanProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("NaN cannot be represented in JSON Schema");
    }
};
const templateLiteralProcessor = (schema, _ctx, json, _params) => {
    const _json = json;
    const pattern = schema._zod.pattern;
    if (!pattern)
        throw new Error("Pattern not found in template literal");
    _json.type = "string";
    _json.pattern = pattern.source;
};
const fileProcessor = (schema, _ctx, json, _params) => {
    const _json = json;
    const file = {
        type: "string",
        format: "binary",
        contentEncoding: "binary",
    };
    const { minimum, maximum, mime } = schema._zod.bag;
    if (minimum !== undefined)
        file.minLength = minimum;
    if (maximum !== undefined)
        file.maxLength = maximum;
    if (mime) {
        if (mime.length === 1) {
            file.contentMediaType = mime[0];
            Object.assign(_json, file);
        }
        else {
            Object.assign(_json, file); // shared props at root
            _json.anyOf = mime.map((m) => ({ contentMediaType: m })); // only contentMediaType differs
        }
    }
    else {
        Object.assign(_json, file);
    }
};
const successProcessor = (_schema, _ctx, json, _params) => {
    json.type = "boolean";
};
const customProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Custom types cannot be represented in JSON Schema");
    }
};
const functionProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Function types cannot be represented in JSON Schema");
    }
};
const transformProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Transforms cannot be represented in JSON Schema");
    }
};
const mapProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Map cannot be represented in JSON Schema");
    }
};
const setProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Set cannot be represented in JSON Schema");
    }
};
// ==================== COMPOSITE TYPE PROCESSORS ====================
const arrayProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    const { minimum, maximum } = schema._zod.bag;
    if (typeof minimum === "number")
        json.minItems = minimum;
    if (typeof maximum === "number")
        json.maxItems = maximum;
    json.type = "array";
    json.items = process(def.element, ctx, {
        ...params,
        path: [...params.path, "items"],
    });
};
const objectProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    json.properties = {};
    const shape = def.shape;
    for (const key in shape) {
        json.properties[key] = process(shape[key], ctx, {
            ...params,
            path: [...params.path, "properties", key],
        });
    }
    // required keys
    const allKeys = new Set(Object.keys(shape));
    const requiredKeys = new Set([...allKeys].filter((key) => {
        const v = def.shape[key]._zod;
        if (ctx.io === "input") {
            return v.optin === undefined;
        }
        else {
            return v.optout === undefined;
        }
    }));
    if (requiredKeys.size > 0) {
        json.required = Array.from(requiredKeys);
    }
    // catchall
    if (def.catchall?._zod.def.type === "never") {
        // strict
        json.additionalProperties = false;
    }
    else if (!def.catchall) {
        // regular
        if (ctx.io === "output")
            json.additionalProperties = false;
    }
    else if (def.catchall) {
        json.additionalProperties = process(def.catchall, ctx, {
            ...params,
            path: [...params.path, "additionalProperties"],
        });
    }
};
const unionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    // Exclusive unions (inclusive === false) use oneOf (exactly one match) instead of anyOf (one or more matches)
    // This includes both z.xor() and discriminated unions
    const isExclusive = def.inclusive === false;
    const options = def.options.map((x, i) => process(x, ctx, {
        ...params,
        path: [...params.path, isExclusive ? "oneOf" : "anyOf", i],
    }));
    if (isExclusive) {
        json.oneOf = options;
    }
    else {
        json.anyOf = options;
    }
};
const intersectionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const a = process(def.left, ctx, {
        ...params,
        path: [...params.path, "allOf", 0],
    });
    const b = process(def.right, ctx, {
        ...params,
        path: [...params.path, "allOf", 1],
    });
    const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
    const allOf = [
        ...(isSimpleIntersection(a) ? a.allOf : [a]),
        ...(isSimpleIntersection(b) ? b.allOf : [b]),
    ];
    json.allOf = allOf;
};
const tupleProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "array";
    const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
    const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
    const prefixItems = def.items.map((x, i) => process(x, ctx, {
        ...params,
        path: [...params.path, prefixPath, i],
    }));
    const rest = def.rest
        ? process(def.rest, ctx, {
            ...params,
            path: [...params.path, restPath, ...(ctx.target === "openapi-3.0" ? [def.items.length] : [])],
        })
        : null;
    if (ctx.target === "draft-2020-12") {
        json.prefixItems = prefixItems;
        if (rest) {
            json.items = rest;
        }
    }
    else if (ctx.target === "openapi-3.0") {
        json.items = {
            anyOf: prefixItems,
        };
        if (rest) {
            json.items.anyOf.push(rest);
        }
        json.minItems = prefixItems.length;
        if (!rest) {
            json.maxItems = prefixItems.length;
        }
    }
    else {
        json.items = prefixItems;
        if (rest) {
            json.additionalItems = rest;
        }
    }
    // length
    const { minimum, maximum } = schema._zod.bag;
    if (typeof minimum === "number")
        json.minItems = minimum;
    if (typeof maximum === "number")
        json.maxItems = maximum;
};
const recordProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    // For looseRecord with regex patterns, use patternProperties
    // This correctly represents "only validate keys matching the pattern" semantics
    // and composes well with allOf (intersections)
    const keyType = def.keyType;
    const keyBag = keyType._zod.bag;
    const patterns = keyBag?.patterns;
    if (def.mode === "loose" && patterns && patterns.size > 0) {
        // Use patternProperties for looseRecord with regex patterns
        const valueSchema = process(def.valueType, ctx, {
            ...params,
            path: [...params.path, "patternProperties", "*"],
        });
        json.patternProperties = {};
        for (const pattern of patterns) {
            json.patternProperties[pattern.source] = valueSchema;
        }
    }
    else {
        // Default behavior: use propertyNames + additionalProperties
        if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
            json.propertyNames = process(def.keyType, ctx, {
                ...params,
                path: [...params.path, "propertyNames"],
            });
        }
        json.additionalProperties = process(def.valueType, ctx, {
            ...params,
            path: [...params.path, "additionalProperties"],
        });
    }
    // Add required for keys with discrete values (enum, literal, etc.)
    const keyValues = keyType._zod.values;
    if (keyValues) {
        const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
        if (validKeyValues.length > 0) {
            json.required = validKeyValues;
        }
    }
};
const nullableProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const inner = process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    if (ctx.target === "openapi-3.0") {
        seen.ref = def.innerType;
        json.nullable = true;
    }
    else {
        json.anyOf = [inner, { type: "null" }];
    }
};
const nonoptionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const defaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
const prefaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    if (ctx.io === "input")
        json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
const catchProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    let catchValue;
    try {
        catchValue = def.catchValue(undefined);
    }
    catch {
        throw new Error("Dynamic catch values are not supported in JSON Schema");
    }
    json.default = catchValue;
};
const pipeProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    const inIsTransform = def.in._zod.traits.has("$ZodTransform");
    const innerType = ctx.io === "input" ? (inIsTransform ? def.out : def.in) : def.out;
    process(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
};
const readonlyProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.readOnly = true;
};
const promiseProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    json_schema_processors_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const optionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const lazyProcessor = (schema, ctx, _json, params) => {
    const innerType = schema._zod.innerType;
    json_schema_processors_process(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
};
// ==================== ALL PROCESSORS ====================
const allProcessors = (/* unused pure expression or super */ null && ({
    string: stringProcessor,
    number: numberProcessor,
    boolean: booleanProcessor,
    bigint: bigintProcessor,
    symbol: symbolProcessor,
    null: nullProcessor,
    undefined: undefinedProcessor,
    void: voidProcessor,
    never: neverProcessor,
    any: anyProcessor,
    unknown: unknownProcessor,
    date: dateProcessor,
    enum: enumProcessor,
    literal: literalProcessor,
    nan: nanProcessor,
    template_literal: templateLiteralProcessor,
    file: fileProcessor,
    success: successProcessor,
    custom: customProcessor,
    function: functionProcessor,
    transform: transformProcessor,
    map: mapProcessor,
    set: setProcessor,
    array: arrayProcessor,
    object: objectProcessor,
    union: unionProcessor,
    intersection: intersectionProcessor,
    tuple: tupleProcessor,
    record: recordProcessor,
    nullable: nullableProcessor,
    nonoptional: nonoptionalProcessor,
    default: defaultProcessor,
    prefault: prefaultProcessor,
    catch: catchProcessor,
    pipe: pipeProcessor,
    readonly: readonlyProcessor,
    promise: promiseProcessor,
    optional: optionalProcessor,
    lazy: lazyProcessor,
}));
function toJSONSchema(input, params) {
    if ("_idmap" in input) {
        // Registry case
        const registry = input;
        const ctx = json_schema_processors_initializeContext({ ...params, processors: allProcessors });
        const defs = {};
        // First pass: process all schemas to build the seen map
        for (const entry of registry._idmap.entries()) {
            const [_, schema] = entry;
            json_schema_processors_process(schema, ctx);
        }
        const schemas = {};
        const external = {
            registry,
            uri: params?.uri,
            defs,
        };
        // Update the context with external configuration
        ctx.external = external;
        // Second pass: emit each schema
        for (const entry of registry._idmap.entries()) {
            const [key, schema] = entry;
            json_schema_processors_extractDefs(ctx, schema);
            schemas[key] = json_schema_processors_finalize(ctx, schema);
        }
        if (Object.keys(defs).length > 0) {
            const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
            schemas.__shared = {
                [defsSegment]: defs,
            };
        }
        return { schemas };
    }
    // Single schema case
    const ctx = json_schema_processors_initializeContext({ ...params, processors: allProcessors });
    json_schema_processors_process(input, ctx);
    json_schema_processors_extractDefs(ctx, input);
    return json_schema_processors_finalize(ctx, input);
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js


const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_datetime(params) {
    return _isoDateTime(ZodISODateTime, params);
}
const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
    $ZodISODate.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_date(params) {
    return _isoDate(ZodISODate, params);
}
const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
    $ZodISOTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_time(params) {
    return _isoTime(ZodISOTime, params);
}
const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_duration(params) {
    return _isoDuration(ZodISODuration, params);
}

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
/* unused harmony import specifier */ var errors_core;



const errors_initializer = (inst, issues) => {
    $ZodError.init(inst, issues);
    inst.name = "ZodError";
    Object.defineProperties(inst, {
        format: {
            value: (mapper) => formatError(inst, mapper),
            // enumerable: false,
        },
        flatten: {
            value: (mapper) => flattenError(inst, mapper),
            // enumerable: false,
        },
        addIssue: {
            value: (issue) => {
                inst.issues.push(issue);
                inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
            },
            // enumerable: false,
        },
        addIssues: {
            value: (issues) => {
                inst.issues.push(...issues);
                inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
            },
            // enumerable: false,
        },
        isEmpty: {
            get() {
                return inst.issues.length === 0;
            },
            // enumerable: false,
        },
    });
    // Object.defineProperty(inst, "isEmpty", {
    //   get() {
    //     return inst.issues.length === 0;
    //   },
    // });
};
const ZodError = /*@__PURE__*/ (/* unused pure expression or super */ null && (errors_core.$constructor("ZodError", errors_initializer)));
const ZodRealError = /*@__PURE__*/ $constructor("ZodError", errors_initializer, {
    Parent: Error,
});
// /** @deprecated Use `z.core.$ZodErrorMapCtx` instead. */
// export type ErrorMapCtx = core.$ZodErrorMapCtx;

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js


const parse_parse = /* @__PURE__ */ _parse(ZodRealError);
const parse_parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
const parse_safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
const parse_safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
// Codec functions
const parse_encode = /* @__PURE__ */ _encode(ZodRealError);
const parse_decode = /* @__PURE__ */ _decode(ZodRealError);
const parse_encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
const parse_decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
const parse_safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
const parse_safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
const parse_safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
const parse_safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

;// ./node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
/* unused harmony import specifier */ var classic_schemas_core;
/* unused harmony import specifier */ var classic_schemas_util;
/* unused harmony import specifier */ var processors;
/* unused harmony import specifier */ var schemas_checks;







// Lazy-bind builder methods.
//
// Builder methods (`.optional`, `.array`, `.refine`, ...) live as
// non-enumerable getters on each concrete schema constructor's
// prototype. On first access from an instance the getter allocates
// `fn.bind(this)` and caches it as an own property on that instance,
// so detached usage (`const m = schema.optional; m()`) still works
// and the per-instance allocation only happens for methods actually
// touched.
//
// One install per (prototype, group), memoized by `_installedGroups`.
const _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
    const proto = Object.getPrototypeOf(inst);
    let installed = _installedGroups.get(proto);
    if (!installed) {
        installed = new Set();
        _installedGroups.set(proto, installed);
    }
    if (installed.has(group))
        return;
    installed.add(group);
    for (const key in methods) {
        const fn = methods[key];
        Object.defineProperty(proto, key, {
            configurable: true,
            enumerable: false,
            get() {
                const bound = fn.bind(this);
                Object.defineProperty(this, key, {
                    configurable: true,
                    writable: true,
                    enumerable: true,
                    value: bound,
                });
                return bound;
            },
            set(v) {
                Object.defineProperty(this, key, {
                    configurable: true,
                    writable: true,
                    enumerable: true,
                    value: v,
                });
            },
        });
    }
}
const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
    $ZodType.init(inst, def);
    Object.assign(inst["~standard"], {
        jsonSchema: {
            input: createStandardJSONSchemaMethod(inst, "input"),
            output: createStandardJSONSchemaMethod(inst, "output"),
        },
    });
    inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
    inst.def = def;
    inst.type = def.type;
    Object.defineProperty(inst, "_def", { value: def });
    // Parse-family is intentionally kept as per-instance closures: these are
    // the hot path AND the most-detached methods (`arr.map(schema.parse)`,
    // `const { parse } = schema`, etc.). Eager closures here mean callers pay
    // ~12 closure allocations per schema but get monomorphic call sites and
    // detached usage that "just works".
    inst.parse = (data, params) => parse_parse(inst, data, params, { callee: inst.parse });
    inst.safeParse = (data, params) => parse_safeParse(inst, data, params);
    inst.parseAsync = async (data, params) => parse_parseAsync(inst, data, params, { callee: inst.parseAsync });
    inst.safeParseAsync = async (data, params) => parse_safeParseAsync(inst, data, params);
    inst.spa = inst.safeParseAsync;
    inst.encode = (data, params) => parse_encode(inst, data, params);
    inst.decode = (data, params) => parse_decode(inst, data, params);
    inst.encodeAsync = async (data, params) => parse_encodeAsync(inst, data, params);
    inst.decodeAsync = async (data, params) => parse_decodeAsync(inst, data, params);
    inst.safeEncode = (data, params) => parse_safeEncode(inst, data, params);
    inst.safeDecode = (data, params) => parse_safeDecode(inst, data, params);
    inst.safeEncodeAsync = async (data, params) => parse_safeEncodeAsync(inst, data, params);
    inst.safeDecodeAsync = async (data, params) => parse_safeDecodeAsync(inst, data, params);
    // All builder methods are placed on the internal prototype as lazy-bind
    // getters. On first access per-instance, a bound thunk is allocated and
    // cached as an own property; subsequent accesses skip the getter. This
    // means: no per-instance allocation for unused methods, full
    // detachability preserved (`const m = schema.optional; m()` works), and
    // shared underlying function references across all instances.
    _installLazyMethods(inst, "ZodType", {
        check(...chks) {
            const def = this.def;
            return this.clone(mergeDefs(def, {
                checks: [
                    ...(def.checks ?? []),
                    ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch),
                ],
            }), { parent: true });
        },
        with(...chks) {
            return this.check(...chks);
        },
        clone(def, params) {
            return clone(this, def, params);
        },
        brand() {
            return this;
        },
        register(reg, meta) {
            reg.add(this, meta);
            return this;
        },
        refine(check, params) {
            return this.check(refine(check, params));
        },
        superRefine(refinement, params) {
            return this.check(superRefine(refinement, params));
        },
        overwrite(fn) {
            return this.check(_overwrite(fn));
        },
        optional() {
            return optional(this);
        },
        exactOptional() {
            return exactOptional(this);
        },
        nullable() {
            return nullable(this);
        },
        nullish() {
            return optional(nullable(this));
        },
        nonoptional(params) {
            return nonoptional(this, params);
        },
        array() {
            return array(this);
        },
        or(arg) {
            return union([this, arg]);
        },
        and(arg) {
            return intersection(this, arg);
        },
        transform(tx) {
            return pipe(this, transform(tx));
        },
        default(d) {
            return schemas_default(this, d);
        },
        prefault(d) {
            return prefault(this, d);
        },
        catch(params) {
            return schemas_catch(this, params);
        },
        pipe(target) {
            return pipe(this, target);
        },
        readonly() {
            return readonly(this);
        },
        describe(description) {
            const cl = this.clone();
            globalRegistry.add(cl, { description });
            return cl;
        },
        meta(...args) {
            // overloaded: meta() returns the registered metadata, meta(data)
            // returns a clone with `data` registered. The mapped type picks
            // up the second overload, so we accept variadic any-args and
            // return `any` to satisfy both at runtime.
            if (args.length === 0)
                return globalRegistry.get(this);
            const cl = this.clone();
            globalRegistry.add(cl, args[0]);
            return cl;
        },
        isOptional() {
            return this.safeParse(undefined).success;
        },
        isNullable() {
            return this.safeParse(null).success;
        },
        apply(fn) {
            return fn(this);
        },
    });
    Object.defineProperty(inst, "description", {
        get() {
            return globalRegistry.get(inst)?.description;
        },
        configurable: true,
    });
    return inst;
});
/** @internal */
const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
    const bag = inst._zod.bag;
    inst.format = bag.format ?? null;
    inst.minLength = bag.minimum ?? null;
    inst.maxLength = bag.maximum ?? null;
    _installLazyMethods(inst, "_ZodString", {
        regex(...args) {
            return this.check(_regex(...args));
        },
        includes(...args) {
            return this.check(_includes(...args));
        },
        startsWith(...args) {
            return this.check(_startsWith(...args));
        },
        endsWith(...args) {
            return this.check(_endsWith(...args));
        },
        min(...args) {
            return this.check(_minLength(...args));
        },
        max(...args) {
            return this.check(_maxLength(...args));
        },
        length(...args) {
            return this.check(_length(...args));
        },
        nonempty(...args) {
            return this.check(_minLength(1, ...args));
        },
        lowercase(params) {
            return this.check(_lowercase(params));
        },
        uppercase(params) {
            return this.check(_uppercase(params));
        },
        trim() {
            return this.check(_trim());
        },
        normalize(...args) {
            return this.check(_normalize(...args));
        },
        toLowerCase() {
            return this.check(_toLowerCase());
        },
        toUpperCase() {
            return this.check(_toUpperCase());
        },
        slugify() {
            return this.check(_slugify());
        },
    });
});
const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    _ZodString.init(inst, def);
    inst.email = (params) => inst.check(_email(ZodEmail, params));
    inst.url = (params) => inst.check(_url(ZodURL, params));
    inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
    inst.emoji = (params) => inst.check(api_emoji(ZodEmoji, params));
    inst.guid = (params) => inst.check(_guid(ZodGUID, params));
    inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
    inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
    inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
    inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
    inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
    inst.guid = (params) => inst.check(_guid(ZodGUID, params));
    inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
    inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
    inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
    inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
    inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
    inst.xid = (params) => inst.check(_xid(ZodXID, params));
    inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
    inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
    inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
    inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
    inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
    inst.e164 = (params) => inst.check(_e164(ZodE164, params));
    // iso
    inst.datetime = (params) => inst.check(iso_datetime(params));
    inst.date = (params) => inst.check(iso_date(params));
    inst.time = (params) => inst.check(iso_time(params));
    inst.duration = (params) => inst.check(iso_duration(params));
});
function schemas_string(params) {
    return _string(ZodString, params);
}
const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    _ZodString.init(inst, def);
});
const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodEmail.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_email(params) {
    return classic_schemas_core._email(ZodEmail, params);
}
const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodGUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_guid(params) {
    return classic_schemas_core._guid(ZodGUID, params);
}
const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodUUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_uuid(params) {
    return classic_schemas_core._uuid(ZodUUID, params);
}
function uuidv4(params) {
    return classic_schemas_core._uuidv4(ZodUUID, params);
}
// ZodUUIDv6
function uuidv6(params) {
    return classic_schemas_core._uuidv6(ZodUUID, params);
}
// ZodUUIDv7
function uuidv7(params) {
    return classic_schemas_core._uuidv7(ZodUUID, params);
}
const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodURL.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function url(params) {
    return classic_schemas_core._url(ZodURL, params);
}
function httpUrl(params) {
    return classic_schemas_core._url(ZodURL, {
        protocol: classic_schemas_core.regexes.httpProtocol,
        hostname: classic_schemas_core.regexes.domain,
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodEmoji.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_emoji(params) {
    return classic_schemas_core._emoji(ZodEmoji, params);
}
const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodNanoID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_nanoid(params) {
    return classic_schemas_core._nanoid(ZodNanoID, params);
}
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link ZodCUID2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodCUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
/**
 * Validates a CUID v1 string.
 *
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link cuid2 | `z.cuid2()`} instead.
 * See https://github.com/paralleldrive/cuid.
 */
function schemas_cuid(params) {
    return classic_schemas_core._cuid(ZodCUID, params);
}
const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodCUID2.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_cuid2(params) {
    return classic_schemas_core._cuid2(ZodCUID2, params);
}
const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodULID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ulid(params) {
    return classic_schemas_core._ulid(ZodULID, params);
}
const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodXID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_xid(params) {
    return classic_schemas_core._xid(ZodXID, params);
}
const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodKSUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ksuid(params) {
    return classic_schemas_core._ksuid(ZodKSUID, params);
}
const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodIPv4.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ipv4(params) {
    return classic_schemas_core._ipv4(ZodIPv4, params);
}
const ZodMAC = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodMAC", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    classic_schemas_core.$ZodMAC.init(inst, def);
    ZodStringFormat.init(inst, def);
})));
function schemas_mac(params) {
    return classic_schemas_core._mac(ZodMAC, params);
}
const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodIPv6.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ipv6(params) {
    return classic_schemas_core._ipv6(ZodIPv6, params);
}
const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
    $ZodCIDRv4.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_cidrv4(params) {
    return classic_schemas_core._cidrv4(ZodCIDRv4, params);
}
const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
    $ZodCIDRv6.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_cidrv6(params) {
    return classic_schemas_core._cidrv6(ZodCIDRv6, params);
}
const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodBase64.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_base64(params) {
    return classic_schemas_core._base64(ZodBase64, params);
}
const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodBase64URL.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_base64url(params) {
    return classic_schemas_core._base64url(ZodBase64URL, params);
}
const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodE164.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_e164(params) {
    return classic_schemas_core._e164(ZodE164, params);
}
const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodJWT.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function jwt(params) {
    return classic_schemas_core._jwt(ZodJWT, params);
}
const ZodCustomStringFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodCustomStringFormat", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    classic_schemas_core.$ZodCustomStringFormat.init(inst, def);
    ZodStringFormat.init(inst, def);
})));
function stringFormat(format, fnOrRegex, _params = {}) {
    return classic_schemas_core._stringFormat(ZodCustomStringFormat, format, fnOrRegex, _params);
}
function schemas_hostname(_params) {
    return classic_schemas_core._stringFormat(ZodCustomStringFormat, "hostname", classic_schemas_core.regexes.hostname, _params);
}
function schemas_hex(_params) {
    return classic_schemas_core._stringFormat(ZodCustomStringFormat, "hex", classic_schemas_core.regexes.hex, _params);
}
function hash(alg, params) {
    const enc = params?.enc ?? "hex";
    const format = `${alg}_${enc}`;
    const regex = classic_schemas_core.regexes[format];
    if (!regex)
        throw new Error(`Unrecognized hash format: ${format}`);
    return classic_schemas_core._stringFormat(ZodCustomStringFormat, format, regex, params);
}
const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
    $ZodNumber.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
    _installLazyMethods(inst, "ZodNumber", {
        gt(value, params) {
            return this.check(_gt(value, params));
        },
        gte(value, params) {
            return this.check(_gte(value, params));
        },
        min(value, params) {
            return this.check(_gte(value, params));
        },
        lt(value, params) {
            return this.check(_lt(value, params));
        },
        lte(value, params) {
            return this.check(_lte(value, params));
        },
        max(value, params) {
            return this.check(_lte(value, params));
        },
        int(params) {
            return this.check(schemas_int(params));
        },
        safe(params) {
            return this.check(schemas_int(params));
        },
        positive(params) {
            return this.check(_gt(0, params));
        },
        nonnegative(params) {
            return this.check(_gte(0, params));
        },
        negative(params) {
            return this.check(_lt(0, params));
        },
        nonpositive(params) {
            return this.check(_lte(0, params));
        },
        multipleOf(value, params) {
            return this.check(_multipleOf(value, params));
        },
        step(value, params) {
            return this.check(_multipleOf(value, params));
        },
        finite() {
            return this;
        },
    });
    const bag = inst._zod.bag;
    inst.minValue =
        Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
    inst.maxValue =
        Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
    inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
    inst.isFinite = true;
    inst.format = bag.format ?? null;
});
function schemas_number(params) {
    return _number(ZodNumber, params);
}
const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
    $ZodNumberFormat.init(inst, def);
    ZodNumber.init(inst, def);
});
function schemas_int(params) {
    return _int(ZodNumberFormat, params);
}
function float32(params) {
    return classic_schemas_core._float32(ZodNumberFormat, params);
}
function float64(params) {
    return classic_schemas_core._float64(ZodNumberFormat, params);
}
function int32(params) {
    return classic_schemas_core._int32(ZodNumberFormat, params);
}
function uint32(params) {
    return classic_schemas_core._uint32(ZodNumberFormat, params);
}
const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function schemas_boolean(params) {
    return _boolean(ZodBoolean, params);
}
const ZodBigInt = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodBigInt", (inst, def) => {
    classic_schemas_core.$ZodBigInt.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.bigintProcessor(inst, ctx, json, params);
    inst.gte = (value, params) => inst.check(schemas_checks.gte(value, params));
    inst.min = (value, params) => inst.check(schemas_checks.gte(value, params));
    inst.gt = (value, params) => inst.check(schemas_checks.gt(value, params));
    inst.gte = (value, params) => inst.check(schemas_checks.gte(value, params));
    inst.min = (value, params) => inst.check(schemas_checks.gte(value, params));
    inst.lt = (value, params) => inst.check(schemas_checks.lt(value, params));
    inst.lte = (value, params) => inst.check(schemas_checks.lte(value, params));
    inst.max = (value, params) => inst.check(schemas_checks.lte(value, params));
    inst.positive = (params) => inst.check(schemas_checks.gt(BigInt(0), params));
    inst.negative = (params) => inst.check(schemas_checks.lt(BigInt(0), params));
    inst.nonpositive = (params) => inst.check(schemas_checks.lte(BigInt(0), params));
    inst.nonnegative = (params) => inst.check(schemas_checks.gte(BigInt(0), params));
    inst.multipleOf = (value, params) => inst.check(schemas_checks.multipleOf(value, params));
    const bag = inst._zod.bag;
    inst.minValue = bag.minimum ?? null;
    inst.maxValue = bag.maximum ?? null;
    inst.format = bag.format ?? null;
})));
function schemas_bigint(params) {
    return classic_schemas_core._bigint(ZodBigInt, params);
}
const ZodBigIntFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodBigIntFormat", (inst, def) => {
    classic_schemas_core.$ZodBigIntFormat.init(inst, def);
    ZodBigInt.init(inst, def);
})));
// int64
function int64(params) {
    return classic_schemas_core._int64(ZodBigIntFormat, params);
}
// uint64
function uint64(params) {
    return classic_schemas_core._uint64(ZodBigIntFormat, params);
}
const ZodSymbol = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodSymbol", (inst, def) => {
    classic_schemas_core.$ZodSymbol.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.symbolProcessor(inst, ctx, json, params);
})));
function symbol(params) {
    return classic_schemas_core._symbol(ZodSymbol, params);
}
const ZodUndefined = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodUndefined", (inst, def) => {
    classic_schemas_core.$ZodUndefined.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.undefinedProcessor(inst, ctx, json, params);
})));
function schemas_undefined(params) {
    return classic_schemas_core._undefined(ZodUndefined, params);
}

const ZodNull = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodNull", (inst, def) => {
    classic_schemas_core.$ZodNull.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.nullProcessor(inst, ctx, json, params);
})));
function schemas_null(params) {
    return classic_schemas_core._null(ZodNull, params);
}

const ZodAny = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodAny", (inst, def) => {
    classic_schemas_core.$ZodAny.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.anyProcessor(inst, ctx, json, params);
})));
function any() {
    return classic_schemas_core._any(ZodAny);
}
const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
    $ZodUnknown.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
    return _unknown(ZodUnknown);
}
const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
    $ZodNever.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
    return _never(ZodNever, params);
}
const ZodVoid = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodVoid", (inst, def) => {
    classic_schemas_core.$ZodVoid.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.voidProcessor(inst, ctx, json, params);
})));
function schemas_void(params) {
    return classic_schemas_core._void(ZodVoid, params);
}

const ZodDate = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodDate", (inst, def) => {
    classic_schemas_core.$ZodDate.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.dateProcessor(inst, ctx, json, params);
    inst.min = (value, params) => inst.check(schemas_checks.gte(value, params));
    inst.max = (value, params) => inst.check(schemas_checks.lte(value, params));
    const c = inst._zod.bag;
    inst.minDate = c.minimum ? new Date(c.minimum) : null;
    inst.maxDate = c.maximum ? new Date(c.maximum) : null;
})));
function schemas_date(params) {
    return classic_schemas_core._date(ZodDate, params);
}
const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
    $ZodArray.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
    inst.element = def.element;
    _installLazyMethods(inst, "ZodArray", {
        min(n, params) {
            return this.check(_minLength(n, params));
        },
        nonempty(params) {
            return this.check(_minLength(1, params));
        },
        max(n, params) {
            return this.check(_maxLength(n, params));
        },
        length(n, params) {
            return this.check(_length(n, params));
        },
        unwrap() {
            return this.element;
        },
    });
});
function array(element, params) {
    return _array(ZodArray, element, params);
}
// .keyof
function keyof(schema) {
    const shape = schema._zod.def.shape;
    return schemas_enum(Object.keys(shape));
}
const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
    $ZodObjectJIT.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
    defineLazy(inst, "shape", () => {
        return def.shape;
    });
    _installLazyMethods(inst, "ZodObject", {
        keyof() {
            return schemas_enum(Object.keys(this._zod.def.shape));
        },
        catchall(catchall) {
            return this.clone({ ...this._zod.def, catchall: catchall });
        },
        passthrough() {
            return this.clone({ ...this._zod.def, catchall: unknown() });
        },
        loose() {
            return this.clone({ ...this._zod.def, catchall: unknown() });
        },
        strict() {
            return this.clone({ ...this._zod.def, catchall: never() });
        },
        strip() {
            return this.clone({ ...this._zod.def, catchall: undefined });
        },
        extend(incoming) {
            return extend(this, incoming);
        },
        safeExtend(incoming) {
            return safeExtend(this, incoming);
        },
        merge(other) {
            return merge(this, other);
        },
        pick(mask) {
            return pick(this, mask);
        },
        omit(mask) {
            return omit(this, mask);
        },
        partial(...args) {
            return partial(ZodOptional, this, args[0]);
        },
        required(...args) {
            return required(ZodNonOptional, this, args[0]);
        },
    });
});
function object(shape, params) {
    const def = {
        type: "object",
        shape: shape ?? {},
        ...normalizeParams(params),
    };
    return new ZodObject(def);
}
// strictObject
function strictObject(shape, params) {
    return new ZodObject({
        type: "object",
        shape,
        catchall: never(),
        ...classic_schemas_util.normalizeParams(params),
    });
}
// looseObject
function looseObject(shape, params) {
    return new ZodObject({
        type: "object",
        shape,
        catchall: unknown(),
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
});
function union(options, params) {
    return new ZodUnion({
        type: "union",
        options: options,
        ...normalizeParams(params),
    });
}
const ZodXor = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodXor", (inst, def) => {
    ZodUnion.init(inst, def);
    classic_schemas_core.$ZodXor.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
})));
/** Creates an exclusive union (XOR) where exactly one option must match.
 * Unlike regular unions that succeed when any option matches, xor fails if
 * zero or more than one option matches the input. */
function xor(options, params) {
    return new ZodXor({
        type: "union",
        options: options,
        inclusive: false,
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodDiscriminatedUnion = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodDiscriminatedUnion", (inst, def) => {
    ZodUnion.init(inst, def);
    classic_schemas_core.$ZodDiscriminatedUnion.init(inst, def);
})));
function discriminatedUnion(discriminator, options, params) {
    // const [options, params] = args;
    return new ZodDiscriminatedUnion({
        type: "union",
        options,
        discriminator,
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
    $ZodIntersection.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
    return new ZodIntersection({
        type: "intersection",
        left: left,
        right: right,
    });
}
const ZodTuple = /*@__PURE__*/ $constructor("ZodTuple", (inst, def) => {
    $ZodTuple.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
    inst.rest = (rest) => inst.clone({
        ...inst._zod.def,
        rest: rest,
    });
});
function tuple(items, _paramsOrRest, _params) {
    const hasRest = _paramsOrRest instanceof $ZodType;
    const params = hasRest ? _params : _paramsOrRest;
    const rest = hasRest ? _paramsOrRest : null;
    return new ZodTuple({
        type: "tuple",
        items: items,
        rest,
        ...normalizeParams(params),
    });
}
const ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
    $ZodRecord.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
    // v3-compat: z.record(valueType, params?) — defaults keyType to z.string()
    if (!valueType || !valueType._zod) {
        return new ZodRecord({
            type: "record",
            keyType: schemas_string(),
            valueType: keyType,
            ...normalizeParams(valueType),
        });
    }
    return new ZodRecord({
        type: "record",
        keyType,
        valueType: valueType,
        ...normalizeParams(params),
    });
}
// type alksjf = core.output<core.$ZodRecordKey>;
function partialRecord(keyType, valueType, params) {
    const k = classic_schemas_core.clone(keyType);
    k._zod.values = undefined;
    return new ZodRecord({
        type: "record",
        keyType: k,
        valueType: valueType,
        ...classic_schemas_util.normalizeParams(params),
    });
}
function looseRecord(keyType, valueType, params) {
    return new ZodRecord({
        type: "record",
        keyType,
        valueType: valueType,
        mode: "loose",
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodMap = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodMap", (inst, def) => {
    classic_schemas_core.$ZodMap.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.mapProcessor(inst, ctx, json, params);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
    inst.min = (...args) => inst.check(classic_schemas_core._minSize(...args));
    inst.nonempty = (params) => inst.check(classic_schemas_core._minSize(1, params));
    inst.max = (...args) => inst.check(classic_schemas_core._maxSize(...args));
    inst.size = (...args) => inst.check(classic_schemas_core._size(...args));
})));
function map(keyType, valueType, params) {
    return new ZodMap({
        type: "map",
        keyType: keyType,
        valueType: valueType,
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodSet = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodSet", (inst, def) => {
    classic_schemas_core.$ZodSet.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.setProcessor(inst, ctx, json, params);
    inst.min = (...args) => inst.check(classic_schemas_core._minSize(...args));
    inst.nonempty = (params) => inst.check(classic_schemas_core._minSize(1, params));
    inst.max = (...args) => inst.check(classic_schemas_core._maxSize(...args));
    inst.size = (...args) => inst.check(classic_schemas_core._size(...args));
})));
function set(valueType, params) {
    return new ZodSet({
        type: "set",
        valueType: valueType,
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
    $ZodEnum.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
    inst.enum = def.entries;
    inst.options = Object.values(def.entries);
    const keys = new Set(Object.keys(def.entries));
    inst.extract = (values, params) => {
        const newEntries = {};
        for (const value of values) {
            if (keys.has(value)) {
                newEntries[value] = def.entries[value];
            }
            else
                throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
            ...def,
            checks: [],
            ...normalizeParams(params),
            entries: newEntries,
        });
    };
    inst.exclude = (values, params) => {
        const newEntries = { ...def.entries };
        for (const value of values) {
            if (keys.has(value)) {
                delete newEntries[value];
            }
            else
                throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
            ...def,
            checks: [],
            ...normalizeParams(params),
            entries: newEntries,
        });
    };
});
function schemas_enum(values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    return new ZodEnum({
        type: "enum",
        entries,
        ...normalizeParams(params),
    });
}

/** @deprecated This API has been merged into `z.enum()`. Use `z.enum()` instead.
 *
 * ```ts
 * enum Colors { red, green, blue }
 * z.enum(Colors);
 * ```
 */
function nativeEnum(entries, params) {
    return new ZodEnum({
        type: "enum",
        entries,
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
    $ZodLiteral.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
    inst.values = new Set(def.values);
    Object.defineProperty(inst, "value", {
        get() {
            if (def.values.length > 1) {
                throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
            }
            return def.values[0];
        },
    });
});
function literal(value, params) {
    return new ZodLiteral({
        type: "literal",
        values: Array.isArray(value) ? value : [value],
        ...normalizeParams(params),
    });
}
const ZodFile = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodFile", (inst, def) => {
    classic_schemas_core.$ZodFile.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.fileProcessor(inst, ctx, json, params);
    inst.min = (size, params) => inst.check(classic_schemas_core._minSize(size, params));
    inst.max = (size, params) => inst.check(classic_schemas_core._maxSize(size, params));
    inst.mime = (types, params) => inst.check(classic_schemas_core._mime(Array.isArray(types) ? types : [types], params));
})));
function file(params) {
    return classic_schemas_core._file(ZodFile, params);
}
const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
    $ZodTransform.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
    inst._zod.parse = (payload, _ctx) => {
        if (_ctx.direction === "backward") {
            throw new $ZodEncodeError(inst.constructor.name);
        }
        payload.addIssue = (issue) => {
            if (typeof issue === "string") {
                payload.issues.push(util_issue(issue, payload.value, def));
            }
            else {
                // for Zod 3 backwards compatibility
                const _issue = issue;
                if (_issue.fatal)
                    _issue.continue = false;
                _issue.code ?? (_issue.code = "custom");
                _issue.input ?? (_issue.input = payload.value);
                _issue.inst ?? (_issue.inst = inst);
                // _issue.continue ??= true;
                payload.issues.push(util_issue(_issue));
            }
        };
        const output = def.transform(payload.value, payload);
        if (output instanceof Promise) {
            return output.then((output) => {
                payload.value = output;
                payload.fallback = true;
                return payload;
            });
        }
        payload.value = output;
        payload.fallback = true;
        return payload;
    };
});
function transform(fn) {
    return new ZodTransform({
        type: "transform",
        transform: fn,
    });
}
const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
    return new ZodOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
    $ZodExactOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
    return new ZodExactOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
    $ZodNullable.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
    return new ZodNullable({
        type: "nullable",
        innerType: innerType,
    });
}
// nullish
function schemas_nullish(innerType) {
    return optional(nullable(innerType));
}
const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
    $ZodDefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeDefault = inst.unwrap;
});
function schemas_default(innerType, defaultValue) {
    return new ZodDefault({
        type: "default",
        innerType: innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
        },
    });
}
const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
    $ZodPrefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
    return new ZodPrefault({
        type: "prefault",
        innerType: innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
        },
    });
}
const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
    $ZodNonOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
    return new ZodNonOptional({
        type: "nonoptional",
        innerType: innerType,
        ...normalizeParams(params),
    });
}
const ZodSuccess = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodSuccess", (inst, def) => {
    classic_schemas_core.$ZodSuccess.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.successProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
})));
function success(innerType) {
    return new ZodSuccess({
        type: "success",
        innerType: innerType,
    });
}
const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
    $ZodCatch.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeCatch = inst.unwrap;
});
function schemas_catch(innerType, catchValue) {
    return new ZodCatch({
        type: "catch",
        innerType: innerType,
        catchValue: (typeof catchValue === "function" ? catchValue : () => catchValue),
    });
}

const ZodNaN = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodNaN", (inst, def) => {
    classic_schemas_core.$ZodNaN.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.nanProcessor(inst, ctx, json, params);
})));
function nan(params) {
    return classic_schemas_core._nan(ZodNaN, params);
}
const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
    $ZodPipe.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
    inst.in = def.in;
    inst.out = def.out;
});
function pipe(in_, out) {
    return new ZodPipe({
        type: "pipe",
        in: in_,
        out: out,
        // ...util.normalizeParams(params),
    });
}
const ZodCodec = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodCodec", (inst, def) => {
    ZodPipe.init(inst, def);
    classic_schemas_core.$ZodCodec.init(inst, def);
})));
function codec(in_, out, params) {
    return new ZodCodec({
        type: "pipe",
        in: in_,
        out: out,
        transform: params.decode,
        reverseTransform: params.encode,
    });
}
function invertCodec(codec) {
    const def = codec._zod.def;
    return new ZodCodec({
        type: "pipe",
        in: def.out,
        out: def.in,
        transform: def.reverseTransform,
        reverseTransform: def.transform,
    });
}
const ZodPreprocess = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodPreprocess", (inst, def) => {
    ZodPipe.init(inst, def);
    classic_schemas_core.$ZodPreprocess.init(inst, def);
})));
const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
    $ZodReadonly.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
    return new ZodReadonly({
        type: "readonly",
        innerType: innerType,
    });
}
const ZodTemplateLiteral = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodTemplateLiteral", (inst, def) => {
    classic_schemas_core.$ZodTemplateLiteral.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.templateLiteralProcessor(inst, ctx, json, params);
})));
function templateLiteral(parts, params) {
    return new ZodTemplateLiteral({
        type: "template_literal",
        parts,
        ...classic_schemas_util.normalizeParams(params),
    });
}
const ZodLazy = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodLazy", (inst, def) => {
    classic_schemas_core.$ZodLazy.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.lazyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.getter();
})));
function lazy(getter) {
    return new ZodLazy({
        type: "lazy",
        getter: getter,
    });
}
const ZodPromise = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodPromise", (inst, def) => {
    classic_schemas_core.$ZodPromise.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.promiseProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
})));
function promise(innerType) {
    return new ZodPromise({
        type: "promise",
        innerType: innerType,
    });
}
const ZodFunction = /*@__PURE__*/ (/* unused pure expression or super */ null && (classic_schemas_core.$constructor("ZodFunction", (inst, def) => {
    classic_schemas_core.$ZodFunction.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.functionProcessor(inst, ctx, json, params);
})));
function _function(params) {
    return new ZodFunction({
        type: "function",
        input: Array.isArray(params?.input) ? tuple(params?.input) : (params?.input ?? array(unknown())),
        output: params?.output ?? unknown(),
    });
}

const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
    $ZodCustom.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
// custom checks
function check(fn) {
    const ch = new classic_schemas_core.$ZodCheck({
        check: "custom",
        // ...util.normalizeParams(params),
    });
    ch._zod.check = fn;
    return ch;
}
function custom(fn, _params) {
    return classic_schemas_core._custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
    return _refine(ZodCustom, fn, _params);
}
// superRefine
function superRefine(fn, params) {
    return _superRefine(fn, params);
}
// Re-export describe and meta from core
const schemas_describe = describe;
const schemas_meta = meta;
function _instanceof(cls, params = {}) {
    const inst = new ZodCustom({
        type: "custom",
        check: "custom",
        fn: (data) => data instanceof cls,
        abort: true,
        ...classic_schemas_util.normalizeParams(params),
    });
    inst._zod.bag.Class = cls;
    // Override check to emit invalid_type instead of custom
    inst._zod.check = (payload) => {
        if (!(payload.value instanceof cls)) {
            payload.issues.push({
                code: "invalid_type",
                expected: cls.name,
                input: payload.value,
                inst,
                path: [...(inst._zod.def.path ?? [])],
            });
        }
    };
    return inst;
}

// stringbool
const stringbool = (...args) => classic_schemas_core._stringbool({
    Codec: ZodCodec,
    Boolean: ZodBoolean,
    String: ZodString,
}, ...args);
function json(params) {
    const jsonSchema = lazy(() => {
        return union([schemas_string(params), schemas_number(), schemas_boolean(), schemas_null(), array(jsonSchema), record(schemas_string(), jsonSchema)]);
    });
    return jsonSchema;
}
// preprocess
function preprocess(fn, schema) {
    return new ZodPreprocess({
        type: "pipe",
        in: transform(fn),
        out: schema,
    });
}

;// ./src/ck/domain/date.ts
const DAY_MS = 86_400_000;
function parseISODate(value) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()))
        throw new Error(`无效日期: ${value}`);
    return parsed;
}
function formatISODate(value) {
    return value.toISOString().slice(0, 10);
}
function addDays(value, days) {
    return formatISODate(new Date(parseISODate(value).getTime() + days * DAY_MS));
}
function daysBetween(from, to) {
    return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / DAY_MS);
}
function ageOnDate(birthDate, currentDate) {
    const birth = parseISODate(birthDate);
    const current = parseISODate(currentDate);
    let age = current.getUTCFullYear() - birth.getUTCFullYear();
    const currentMonth = current.getUTCMonth();
    const birthMonth = birth.getUTCMonth();
    if (currentMonth < birthMonth || (currentMonth === birthMonth && current.getUTCDate() < birth.getUTCDate()))
        age -= 1;
    return age;
}
function daysUntilDeadline(state) {
    const deadlines = Object.values(state.situations)
        .filter(item => item.status === 'active' && item.deadline)
        .map(item => item.deadline)
        .sort();
    return deadlines[0] ? Math.max(0, daysBetween(state.currentDate, deadlines[0])) : 0;
}

;// ./src/ck/domain/schema.ts

const ISODateSchema = schemas_string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DaySegmentSchema = schemas_enum(['morning', 'afternoon', 'evening']);
const ContentSettingsSchema = object({
    intimacy: schemas_enum(['abstract', 'detailed']).default('detailed'),
    violence: schemas_enum(['abstract', 'strong']).default('strong'),
    supernatural: schemas_enum(['off', 'ambiguous']).default('ambiguous'),
    explicitContentMinAge: literal(18).default(18),
}).strict();
const ModelLayerSettingsSchema = object({
    presetName: schemas_string().default('in_use'),
    model: schemas_string().optional(),
    maxCallsPerPulse: schemas_number().int().min(0).max(12).default(3),
}).strict();
const GameSettingsSchema = object({
    regularWorldPulseDays: schemas_number().int().min(3).max(30).default(7),
    content: ContentSettingsSchema.prefault({}),
    models: object({
        sceneDirector: ModelLayerSettingsSchema.prefault({}),
        worldPlanner: ModelLayerSettingsSchema.prefault({ maxCallsPerPulse: 1 }),
        keyCharacter: ModelLayerSettingsSchema.prefault({ maxCallsPerPulse: 3 }),
    }).strict().prefault({}),
}).strict();
const ResourcesSchema = object({
    gold: schemas_number().int(),
    prestige: schemas_number().int(),
    piety: schemas_number().int().default(0),
    legitimacy: schemas_number().int().min(0).max(100),
    stress: schemas_number().int().min(0).max(300),
    levies: schemas_number().int().min(0),
}).strict();
const CharacterResourceSchema = object({
    gold: schemas_number().int(),
    prestige: schemas_number().int(),
    piety: schemas_number().int(),
    levies: schemas_number().int().nonnegative(),
    income: schemas_number(),
}).strict();
const AttributesSchema = object({
    diplomacy: schemas_number().int().min(0).max(30),
    martial: schemas_number().int().min(0).max(30),
    stewardship: schemas_number().int().min(0).max(30),
    intrigue: schemas_number().int().min(0).max(30),
    learning: schemas_number().int().min(0).max(30),
    prowess: schemas_number().int().min(0).max(30),
}).strict();
const PersonalitySchema = object({
    boldness: schemas_number().int().min(-100).max(100),
    compassion: schemas_number().int().min(-100).max(100),
    honor: schemas_number().int().min(-100).max(100),
}).strict();
const CharacterSchema = object({
    id: schemas_string(),
    nameKey: schemas_string(),
    originalName: schemas_string(),
    birthDate: ISODateSchema,
    deathDate: ISODateSchema.nullable().default(null),
    sex: schemas_enum(['female', 'male']),
    houseId: schemas_string(),
    dynastyId: schemas_string(),
    parentIds: array(schemas_string()).default([]),
    childIds: array(schemas_string()).default([]),
    spouseIds: array(schemas_string()).default([]),
    betrothedIds: array(schemas_string()).default([]),
    titleIds: array(schemas_string()).default([]),
    liegeId: schemas_string().nullable().default(null),
    locationId: schemas_string(),
    alive: schemas_boolean().default(true),
    imprisonedById: schemas_string().nullable().default(null),
    traits: array(schemas_string()).default([]),
    attributes: AttributesSchema,
    personality: PersonalitySchema,
    health: schemas_number().min(0).max(10).default(5),
    fertility: schemas_number().min(0).max(1).default(0.5),
    stress: schemas_number().int().min(0).max(300).default(0),
    goals: array(schemas_string()).default([]),
    shortTermGoal: schemas_string().nullable().default(null),
    ambition: schemas_string().nullable().default(null),
    knowledgeIds: array(schemas_string()).default([]),
    memoryIds: array(schemas_string()).default([]),
    sourceType: schemas_enum(['attested', 'composite', 'original']),
}).strict();
const TitleSchema = object({
    id: schemas_string(),
    nameKey: schemas_string(),
    rank: schemas_enum(['barony', 'county', 'duchy', 'kingdom', 'empire']),
    holderId: schemas_string().nullable(),
    deJureLiegeId: schemas_string().nullable(),
    deFactoLiegeId: schemas_string().nullable(),
    countyId: schemas_string().nullable().default(null),
    successionLaw: schemas_enum(['partition', 'primogeniture']).default('partition'),
}).strict();
const MapPointSchema = tuple([schemas_number(), schemas_number()]);
const CountySchema = object({
    id: schemas_string(),
    nameKey: schemas_string(),
    originalName: schemas_string(),
    titleId: schemas_string(),
    polygon: array(MapPointSchema).min(3),
    centroid: MapPointSchema,
    adjacentCountyIds: array(schemas_string()),
    locationIds: array(schemas_string()).min(2),
    controllerTitleId: schemas_string(),
    occupation: object({ warId: schemas_string(), occupierTitleId: schemas_string() }).strict().nullable().default(null),
    control: schemas_number().int().min(0).max(100).default(100),
    terrain: schemas_enum(['plains', 'farmlands', 'forest', 'hills', 'coastal']).default('plains'),
    development: schemas_number().int().min(0).max(100).default(10),
    baseTax: schemas_number().nonnegative().default(2),
    baseLevies: schemas_number().int().nonnegative().default(250),
    buildingIds: array(schemas_string()).default([]),
}).strict();
const LocationSchema = object({
    id: schemas_string(),
    countyId: schemas_string(),
    nameKey: schemas_string(),
    kind: schemas_enum(['castle', 'city', 'temple', 'estate', 'inn', 'port', 'road']),
    position: MapPointSchema,
}).strict();
const KnowledgeFactSchema = object({
    id: schemas_string(),
    subjectId: schemas_string(),
    predicate: schemas_string(),
    value: unknown(),
    certainty: schemas_enum(['confirmed', 'reported', 'rumored', 'unknown']),
    sourceId: schemas_string(),
    observedAt: ISODateSchema,
    visibility: schemas_enum(['public', 'private', 'secret']),
}).strict();
const RelationshipDimensionSchema = schemas_enum(['opinion', 'trust', 'fear', 'suspicion', 'attraction']);
const RelationshipModifierSchema = object({
    id: schemas_string(),
    fromId: schemas_string(),
    toId: schemas_string(),
    dimension: RelationshipDimensionSchema,
    delta: schemas_number().int().min(-10).max(10),
    reasonCode: schemas_string(),
    sourceId: schemas_string(),
    sceneId: schemas_string(),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema.nullable(),
}).strict();
const MemorySchema = object({
    id: schemas_string(),
    characterId: schemas_string(),
    subjectIds: array(schemas_string()),
    kind: schemas_string(),
    summary: schemas_string(),
    intensity: schemas_number().int().min(1).max(100),
    createdAt: ISODateSchema,
    expiresAt: ISODateSchema.nullable(),
    visibility: schemas_enum(['public', 'private', 'secret']),
}).strict();
const PromiseSchema = object({
    id: schemas_string(),
    promisorId: schemas_string(),
    beneficiaryId: schemas_string(),
    kind: schemas_string(),
    terms: record(schemas_string(), unknown()),
    dueDate: ISODateSchema,
    status: schemas_enum(['active', 'fulfilled', 'broken', 'expired']),
    sourceId: schemas_string(),
}).strict();
const SupportCommitmentSchema = object({
    id: schemas_string(),
    supporterId: schemas_string(),
    beneficiaryId: schemas_string(),
    issueId: schemas_string(),
    grantedAt: ISODateSchema,
    expiresAt: ISODateSchema,
    status: schemas_enum(['active', 'withdrawn', 'fulfilled', 'broken']),
    conditionPromiseIds: array(schemas_string()),
    sourceId: schemas_string(),
}).strict();
const FactionSchema = object({
    id: schemas_string(),
    nameKey: schemas_string(),
    kind: schemas_enum(['liberty', 'claimant', 'independence']),
    leaderId: schemas_string(),
    memberIds: array(schemas_string()),
    targetId: schemas_string(),
    issueId: schemas_string(),
    power: schemas_number().int().min(0).max(200),
    threshold: schemas_number().int().min(1).max(200),
    deadline: ISODateSchema.nullable(),
    status: schemas_enum(['organizing', 'weakened', 'ultimatum', 'war', 'dissolved']),
    createdAt: ISODateSchema,
}).strict();
const ActivitySchema = object({
    id: schemas_string(),
    type: schemas_enum(['feast', 'tour', 'travel', 'council']),
    hostId: schemas_string(),
    participantIds: array(schemas_string()),
    invitedIds: array(schemas_string()).default([]),
    locationId: schemas_string(),
    phase: schemas_string(),
    startedAt: ISODateSchema,
    endsAt: ISODateSchema.nullable().default(null),
    status: schemas_enum(['planned', 'active', 'completed', 'cancelled']),
    intent: schemas_string().nullable().default(null),
    memoryIds: array(schemas_string()).default([]),
}).strict();
const CommunicationSchema = object({
    id: schemas_string(),
    senderId: schemas_string(),
    recipientId: schemas_string(),
    courierId: schemas_string().nullable(),
    subject: schemas_string(),
    body: schemas_string(),
    sentAt: ISODateSchema,
    deliverAt: ISODateSchema,
    status: schemas_enum(['in_transit', 'delivered', 'refused', 'intercepted', 'answered']),
    interceptedById: schemas_string().nullable(),
    threadId: schemas_string(),
}).strict();
const TravelSchema = object({
    id: schemas_string(),
    leaderId: schemas_string(),
    companionIds: array(schemas_string()),
    routeCountyIds: array(schemas_string()).min(1),
    destinationLocationId: schemas_string(),
    routeKind: schemas_enum(['direct', 'safe']),
    progressIndex: schemas_number().int().nonnegative().default(0),
    currentCountyId: schemas_string(),
    departedAt: ISODateSchema,
    arriveAt: ISODateSchema,
    status: schemas_enum(['planned', 'travelling', 'arrived', 'cancelled']),
}).strict();
const ProjectSchema = object({
    id: schemas_string(),
    ownerId: schemas_string(),
    countyId: schemas_string(),
    templateId: schemas_enum(['watchtower', 'market']),
    startedAt: ISODateSchema,
    completeAt: ISODateSchema,
    status: schemas_enum(['active', 'completed', 'cancelled']),
}).strict();
const WarSchema = object({
    id: schemas_string(),
    kind: schemas_enum(['county_claim', 'faction_revolt']),
    attackerId: schemas_string(),
    defenderId: schemas_string(),
    targetTitleId: schemas_string().nullable(),
    attackerScore: schemas_number().int().min(-100).max(100),
    raisedByIds: array(schemas_string()),
    objectiveCountyId: schemas_string().nullable(),
    routeCountyIds: array(schemas_string()),
    phase: schemas_enum(['declared', 'mobilizing', 'marching', 'siege', 'battle', 'negotiation', 'ended']),
    startedAt: ISODateSchema,
    endedAt: ISODateSchema.nullable(),
}).strict();
const CouncilPositionSchema = object({
    id: schemas_string(),
    liegeId: schemas_string(),
    kind: schemas_enum(['chancellor', 'marshal', 'steward', 'spymaster', 'chaplain', 'regent']),
    holderId: schemas_string().nullable(),
    task: schemas_string().nullable(),
    appointedAt: ISODateSchema.nullable(),
}).strict();
const FeudalContractSchema = object({
    id: schemas_string(),
    liegeId: schemas_string(),
    vassalId: schemas_string(),
    taxLevel: schemas_enum(['low', 'normal', 'high']),
    levyLevel: schemas_enum(['low', 'normal', 'high']),
    privileges: array(schemas_string()),
    modifiedAt: ISODateSchema,
}).strict();
const ClaimSchema = object({
    id: schemas_string(),
    claimantId: schemas_string(),
    titleId: schemas_string(),
    strength: schemas_enum(['weak', 'pressed', 'implicit']),
    inherited: schemas_boolean(),
    createdAt: ISODateSchema,
}).strict();
const MarriageSchema = object({
    id: schemas_string(),
    partnerIds: tuple([schemas_string(), schemas_string()]),
    status: schemas_enum(['proposed', 'betrothed', 'married', 'ended']),
    allianceIds: array(schemas_string()).default([]),
    createdAt: ISODateSchema,
    resolvedAt: ISODateSchema.nullable(),
}).strict();
const SuccessionSchema = object({
    titleId: schemas_string(),
    law: schemas_enum(['partition', 'primogeniture']),
    heirIds: array(schemas_string()),
    updatedAt: ISODateSchema,
}).strict();
const ExternalRealmSchema = object({
    id: schemas_string(),
    nameKey: schemas_string(),
    rulerId: schemas_string(),
    heirId: schemas_string().nullable(),
    strength: schemas_number().int().nonnegative(),
    stability: schemas_number().int().min(0).max(100),
    stanceToPlayer: schemas_enum(['hostile', 'wary', 'neutral', 'friendly', 'allied']),
    warSummary: schemas_string().nullable(),
    pressure: schemas_number().int().min(0).max(100),
    lastSimulatedAt: ISODateSchema,
}).strict();
const SituationSchema = object({
    id: schemas_string(),
    definitionId: schemas_string(),
    nameKey: schemas_string(),
    participantIds: array(schemas_string()),
    phase: schemas_string(),
    startedAt: ISODateSchema,
    deadline: ISODateSchema.nullable(),
    status: schemas_enum(['active', 'resolved', 'failed', 'war']),
    metrics: record(schemas_string(), schemas_number()),
    flags: record(schemas_string(), schemas_boolean()),
    resolution: schemas_string().nullable(),
    sourcePackId: schemas_string(),
}).strict();
const EventChoiceSchema = object({
    id: schemas_string(),
    label: schemas_string(),
    hint: schemas_string().optional(),
}).strict();
const PendingEventSchema = object({
    id: schemas_string(),
    type: schemas_string(),
    title: schemas_string(),
    body: schemas_string(),
    occurredAt: ISODateSchema,
    severity: schemas_enum(['notice', 'major', 'critical']),
    scopeIds: array(schemas_string()),
    requiresResponse: schemas_boolean(),
    choices: array(EventChoiceSchema),
    status: schemas_enum(['pending', 'resolved', 'dismissed']),
    sourceId: schemas_string(),
}).strict();
const NotificationSchema = object({
    id: schemas_string(),
    kind: schemas_enum(['alert', 'message', 'situation', 'world', 'task']),
    title: schemas_string(),
    body: schemas_string(),
    createdAt: ISODateSchema,
    severity: schemas_enum(['info', 'warning', 'danger']),
    relatedIds: array(schemas_string()),
    read: schemas_boolean().default(false),
}).strict();
const InteractionChannelSchema = schemas_enum(['meeting', 'letter', 'messenger', 'activity']);
const InteractionStatusSchema = schemas_enum(['negotiating', 'awaiting_target', 'awaiting_player', 'accepted', 'rejected', 'countered', 'expired']);
const InteractionMessageSchema = object({
    speakerId: schemas_string(),
    text: schemas_string(),
    createdAt: ISODateSchema,
}).strict();
const InteractionThreadSchema = object({
    id: schemas_string(),
    intentId: schemas_string(),
    initiatorId: schemas_string(),
    targetId: schemas_string(),
    channel: InteractionChannelSchema,
    status: InteractionStatusSchema,
    terms: record(schemas_string(), unknown()),
    acceptance: schemas_number().int(),
    acceptanceReasons: array(object({ label: schemas_string(), value: schemas_number().int() }).strict()),
    messages: array(InteractionMessageSchema),
    createdAt: ISODateSchema,
    deadline: ISODateSchema.nullable(),
    sceneId: schemas_string(),
}).strict();
const WorldSignalSchema = object({
    id: schemas_string(),
    type: schemas_enum(['regular_pulse', 'major_change', 'local_activity', 'rule_notice']),
    kind: schemas_string(),
    occurredAt: ISODateSchema,
    scopeIds: array(schemas_string()),
    payload: record(schemas_string(), unknown()),
    consumed: schemas_boolean().default(false),
}).strict();
const DomainEventSchema = object({
    id: schemas_string(),
    revision: schemas_number().int().nonnegative(),
    type: schemas_string(),
    occurredAt: ISODateSchema,
    actorId: schemas_string().nullable(),
    sourceId: schemas_string(),
    idempotencyKey: schemas_string(),
    payload: record(schemas_string(), unknown()),
}).strict();
const GameClockSchema = object({
    date: ISODateSchema,
    segment: DaySegmentSchema,
}).strict();
const GameStateSchema = object({
    schemaVersion: literal(2),
    saveId: schemas_string(),
    revision: schemas_number().int().nonnegative(),
    rngState: schemas_number().int().nonnegative(),
    contentPackIds: array(schemas_string()),
    contentPackVersions: record(schemas_string(), schemas_string()),
    clock: GameClockSchema,
    currentDate: ISODateSchema,
    nextRegularPulseAt: ISODateSchema,
    worldActionCredit: schemas_number().nonnegative().default(0),
    playerCharacterId: schemas_string(),
    regentId: schemas_string().nullable(),
    activeTravelId: schemas_string().nullable(),
    resources: ResourcesSchema,
    characterResources: record(schemas_string(), CharacterResourceSchema),
    settings: GameSettingsSchema,
    characters: record(schemas_string(), CharacterSchema),
    titles: record(schemas_string(), TitleSchema),
    counties: record(schemas_string(), CountySchema),
    locations: record(schemas_string(), LocationSchema),
    knowledge: record(schemas_string(), KnowledgeFactSchema),
    memories: record(schemas_string(), MemorySchema),
    relationshipModifiers: array(RelationshipModifierSchema),
    promises: record(schemas_string(), PromiseSchema),
    supportCommitments: record(schemas_string(), SupportCommitmentSchema),
    factions: record(schemas_string(), FactionSchema),
    activities: record(schemas_string(), ActivitySchema),
    communications: record(schemas_string(), CommunicationSchema),
    travels: record(schemas_string(), TravelSchema),
    projects: record(schemas_string(), ProjectSchema),
    wars: record(schemas_string(), WarSchema),
    council: record(schemas_string(), CouncilPositionSchema),
    contracts: record(schemas_string(), FeudalContractSchema),
    claims: record(schemas_string(), ClaimSchema),
    marriages: record(schemas_string(), MarriageSchema),
    succession: record(schemas_string(), SuccessionSchema),
    externalRealms: record(schemas_string(), ExternalRealmSchema),
    situations: record(schemas_string(), SituationSchema),
    pendingEvents: record(schemas_string(), PendingEventSchema),
    notifications: record(schemas_string(), NotificationSchema),
    interactions: record(schemas_string(), InteractionThreadSchema),
    signals: array(WorldSignalSchema),
    eventLog: array(DomainEventSchema),
}).strict();
const LegacyGameStateSchema = object({
    schemaVersion: literal(1),
    saveId: schemas_string(),
    revision: schemas_number().int().nonnegative(),
    rngState: schemas_number().int().nonnegative(),
    currentDate: ISODateSchema,
}).passthrough();
const ActionCallSchema = object({
    actionId: schemas_string(),
    version: literal(1),
    actorId: schemas_string(),
    targetIds: array(schemas_string()),
    params: record(schemas_string(), unknown()),
    sourceId: schemas_string(),
    sceneId: schemas_string(),
    idempotencyKey: schemas_string(),
    expectedRevision: schemas_number().int().nonnegative(),
}).strict();
const CommandErrorSchema = object({ code: schemas_string(), message: schemas_string() }).strict();
const CommandResultSchema = object({
    status: schemas_enum(['committed', 'rejected', 'duplicate']),
    state: GameStateSchema,
    events: array(DomainEventSchema),
    errors: array(CommandErrorSchema),
}).strict();

;// ./src/ck/content/basePack.ts


const zhCN = {
    'campaign.title': '布列塔尼与诺曼边区',
    'situation.liberty': '裂冠危机',
    'county.rennes': '雷恩', 'county.nantes': '南特', 'county.broerec': '布罗埃雷克／瓦讷',
    'county.cornouaille': '科努瓦耶', 'county.leon': '莱昂', 'county.penthievre': '潘蒂耶夫尔',
    'county.avranches': '阿夫朗什', 'county.mortain': '莫尔坦', 'county.bayeux': '贝桑／巴约',
    'county.evreux': '埃夫勒', 'county.rouen': '鲁昂', 'county.eu': '厄', 'county.maine': '缅因',
    'county.anjou': '安茹', 'county.perche': '佩尔什', 'county.alencon': '阿朗松',
    'character.conan': '科南二世', 'character.hawise': '阿维丝', 'character.hoel': '霍埃尔',
    'character.alanIV': '阿兰·费尔让', 'character.geoffroy': '若弗鲁瓦·博特雷尔',
    'character.eudes': '厄德·德·潘蒂耶夫尔', 'character.morvan': '莫尔万·德·莱昂',
    'character.jeanDol': '让·德·多勒', 'character.alan': '阿兰·德·雷恩', 'character.mael': '马埃尔院长',
    'character.isabeau': '伊莎博·德·雷', 'character.yves': '伊夫·德·雷恩', 'character.guethenoc': '盖特诺克·德·瓦讷',
    'character.rhiwallon': '里瓦隆·德·多勒', 'character.william': '诺曼底的威廉',
    'character.matilda': '佛兰德斯的玛蒂尔达', 'character.robertCurthose': '罗贝尔·柯索斯',
    'character.robertMortain': '莫尔坦的罗贝尔', 'character.emmaMortain': '蒙哥马利的埃玛',
    'character.odo': '巴约的厄德', 'character.richardEvreux': '埃夫勒的理查',
    'character.williamEu': '厄的威廉', 'character.geoffreyAnjou': '安茹的若弗鲁瓦三世',
    'character.ermengarde': '安茹的埃芒加德', 'character.philip': '法兰西的腓力一世',
    'character.bertha': '荷兰的贝尔塔', 'character.baldwin': '佛兰德斯的博杜安五世',
    'character.richilda': '埃诺的里希尔德', 'character.harold': '哈罗德·戈德温森',
    'character.edith': '伊迪丝·斯万内莎', 'character.malcolm': '苏格兰的马尔科姆三世',
    'character.guillaumeAquitaine': '阿基坦的纪尧姆八世', 'character.agnes': '勃艮第的阿涅丝',
    'title.brittany': '布列塔尼公国', 'title.normandy': '诺曼底公国', 'title.france': '法兰西王国',
    'title.england': '英格兰王国', 'title.anjou': '安茹伯爵领', 'faction.liberty': '多勒—孔堡降权派系',
    'external.england': '英格兰', 'external.france': '法兰西王室', 'external.flanders': '佛兰德斯',
    'external.aquitaine': '阿基坦', 'external.scotland': '苏格兰', 'external.papacy': '罗马教廷',
};
function t(key) { return zhCN[key] ?? key; }
// 自行绘制的简化战略几何，不使用 Paradox 地图资产。海岸与边界会由地图组件再叠加表现。
const countyInputs = [
    { id: 'leon', originalName: 'Léon', polygon: [[42, 132], [63, 74], [168, 60], [192, 117], [145, 153], [67, 163]], centroid: [111, 112], adjacent: ['cornouaille', 'penthievre'], holderId: 'char_morvan', deJureLiegeId: 'd_brittany', terrain: 'coastal', tax: 2.1, levies: 330 },
    { id: 'penthievre', originalName: 'Penthièvre', polygon: [[168, 60], [286, 78], [336, 137], [303, 201], [192, 191], [145, 153], [192, 117]], centroid: [240, 133], adjacent: ['leon', 'cornouaille', 'rennes'], holderId: 'char_geoffroy', deJureLiegeId: 'd_brittany', terrain: 'hills', tax: 2.4, levies: 390 },
    { id: 'cornouaille', originalName: 'Cornouaille', polygon: [[67, 163], [145, 153], [192, 191], [207, 267], [141, 300], [51, 256]], centroid: [128, 224], adjacent: ['leon', 'penthievre', 'rennes', 'broerec'], holderId: 'char_hoel', deJureLiegeId: 'd_brittany', terrain: 'coastal', tax: 2.6, levies: 350 },
    { id: 'rennes', originalName: 'Rennes', polygon: [[303, 201], [336, 137], [437, 161], [480, 225], [417, 290], [311, 271]], centroid: [382, 221], adjacent: ['penthievre', 'cornouaille', 'broerec', 'nantes', 'avranches', 'maine'], holderId: 'char_conan', deJureLiegeId: 'd_brittany', terrain: 'farmlands', tax: 4.2, levies: 520 },
    { id: 'broerec', originalName: 'Broërec / Vannes', polygon: [[141, 300], [207, 267], [311, 271], [326, 345], [244, 401], [145, 374]], centroid: [235, 334], adjacent: ['cornouaille', 'rennes', 'nantes'], holderId: 'char_conan', deJureLiegeId: 'd_brittany', terrain: 'coastal', tax: 3.2, levies: 410 },
    { id: 'nantes', originalName: 'Nantes', polygon: [[311, 271], [417, 290], [458, 372], [392, 434], [326, 420], [244, 401], [326, 345]], centroid: [360, 354], adjacent: ['broerec', 'rennes', 'maine', 'anjou'], holderId: 'char_hoel', deJureLiegeId: 'd_brittany', terrain: 'farmlands', tax: 4.8, levies: 480 },
    { id: 'avranches', originalName: 'Avranches', polygon: [[437, 161], [505, 129], [568, 178], [548, 247], [480, 225]], centroid: [508, 190], adjacent: ['rennes', 'mortain', 'bayeux', 'maine'], holderId: 'char_william', deJureLiegeId: 'd_normandy', terrain: 'coastal', tax: 2.8, levies: 360 },
    { id: 'mortain', originalName: 'Mortain', polygon: [[480, 225], [548, 247], [594, 310], [552, 370], [458, 372], [417, 290]], centroid: [510, 305], adjacent: ['avranches', 'bayeux', 'alencon', 'maine', 'rennes'], holderId: 'char_robert_mortain', deJureLiegeId: 'd_normandy', terrain: 'forest', tax: 2.4, levies: 440 },
    { id: 'bayeux', originalName: 'Bessin / Bayeux', polygon: [[505, 129], [618, 89], [679, 140], [645, 208], [568, 178]], centroid: [594, 144], adjacent: ['avranches', 'mortain', 'rouen', 'evreux'], holderId: 'char_odo', deJureLiegeId: 'd_normandy', terrain: 'coastal', tax: 3.6, levies: 410 },
    { id: 'rouen', originalName: 'Rouen', polygon: [[618, 89], [752, 63], [804, 119], [764, 196], [679, 140]], centroid: [714, 126], adjacent: ['bayeux', 'evreux', 'eu'], holderId: 'char_william', deJureLiegeId: 'd_normandy', terrain: 'farmlands', tax: 5.1, levies: 510 },
    { id: 'eu', originalName: 'Eu', polygon: [[752, 63], [875, 76], [911, 148], [804, 173], [804, 119]], centroid: [836, 113], adjacent: ['rouen', 'evreux'], holderId: 'char_william_eu', deJureLiegeId: 'd_normandy', terrain: 'coastal', tax: 2.7, levies: 320 },
    { id: 'evreux', originalName: 'Évreux', polygon: [[645, 208], [679, 140], [764, 196], [804, 173], [836, 265], [748, 315], [663, 286]], centroid: [747, 245], adjacent: ['bayeux', 'rouen', 'eu', 'perche', 'alencon'], holderId: 'char_richard_evreux', deJureLiegeId: 'd_normandy', terrain: 'farmlands', tax: 3.5, levies: 390 },
    { id: 'alencon', originalName: 'Alençon', polygon: [[594, 310], [663, 286], [748, 315], [731, 398], [642, 431], [552, 370]], centroid: [651, 357], adjacent: ['mortain', 'evreux', 'perche', 'maine'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france', terrain: 'hills', tax: 2.5, levies: 380 },
    { id: 'perche', originalName: 'Perche', polygon: [[748, 315], [836, 265], [908, 335], [870, 427], [731, 398]], centroid: [822, 355], adjacent: ['evreux', 'alencon', 'maine', 'anjou'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france', terrain: 'forest', tax: 2.2, levies: 340 },
    { id: 'maine', originalName: 'Maine', polygon: [[458, 372], [552, 370], [642, 431], [618, 515], [505, 543], [412, 482]], centroid: [526, 455], adjacent: ['rennes', 'nantes', 'avranches', 'mortain', 'alencon', 'perche', 'anjou'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france', terrain: 'farmlands', tax: 3.9, levies: 460 },
    { id: 'anjou', originalName: 'Anjou', polygon: [[392, 434], [458, 372], [412, 482], [505, 543], [449, 588], [334, 553], [326, 420]], centroid: [412, 501], adjacent: ['nantes', 'maine', 'perche'], holderId: 'char_geoffrey_anjou', deJureLiegeId: 'k_france', terrain: 'farmlands', tax: 4.4, levies: 470 },
];
const defaultAttributes = { diplomacy: 8, martial: 8, stewardship: 8, intrigue: 8, learning: 8, prowess: 8 };
const defaultPersonality = { boldness: 0, compassion: 0, honor: 0 };
function character(input) {
    const { attributes, personality, ...rest } = input;
    return {
        alive: true, deathDate: null, imprisonedById: null, knowledgeIds: [], memoryIds: [], parentIds: [], childIds: [], spouseIds: [], betrothedIds: [], titleIds: [],
        health: 5, fertility: 0.5, stress: 0, shortTermGoal: null, ambition: null,
        ...rest,
        attributes: { ...defaultAttributes, ...(attributes ?? {}) }, personality: { ...defaultPersonality, ...(personality ?? {}) },
    };
}
function createInitialState(seed = 10660915) {
    const C = {
        char_conan: character({ id: 'char_conan', nameKey: 'character.conan', originalName: 'Conan II de Bretagne', birthDate: '1033-01-01', sex: 'male', houseId: 'house_rennes', dynastyId: 'dynasty_rennes', parentIds: ['char_alan_iii'], childIds: [], titleIds: ['d_brittany', 'c_rennes', 'c_broerec'], liegeId: null, locationId: 'loc_rennes_castle', traits: ['果断', '多疑', '勇武'], attributes: { diplomacy: 9, martial: 14, stewardship: 10, intrigue: 11, learning: 7, prowess: 15 }, personality: { boldness: 55, compassion: -10, honor: 25 }, stress: 20, goals: ['维护公爵权威', '压制叛乱'], shortTermGoal: '重建议会', ambition: '统一布列塔尼', sourceType: 'attested' }),
        char_hawise: character({ id: 'char_hawise', nameKey: 'character.hawise', originalName: 'Hawise de Bretagne', birthDate: '1037-01-01', sex: 'female', houseId: 'house_rennes', dynastyId: 'dynasty_rennes', parentIds: ['char_alan_iii'], childIds: ['char_alan_iv'], spouseIds: ['char_hoel'], liegeId: 'char_conan', locationId: 'loc_nantes_castle', traits: ['谨慎', '宗族纽带', '耐心'], attributes: { diplomacy: 13, martial: 5, stewardship: 12, intrigue: 10, learning: 10, prowess: 3 }, personality: { boldness: -20, compassion: 35, honor: 50 }, goals: ['保护家族继承'], ambition: '确保阿兰继承', sourceType: 'attested' }),
        char_hoel: character({ id: 'char_hoel', nameKey: 'character.hoel', originalName: 'Hoël de Cornouaille', birthDate: '1030-01-01', sex: 'male', houseId: 'house_cornouaille', dynastyId: 'dynasty_cornouaille', spouseIds: ['char_hawise'], childIds: ['char_alan_iv'], titleIds: ['c_cornouaille', 'c_nantes'], liegeId: 'char_conan', locationId: 'loc_nantes_castle', traits: ['务实', '耐心', '重视继承'], attributes: { diplomacy: 13, martial: 10, stewardship: 14, intrigue: 9, learning: 9, prowess: 8 }, personality: { boldness: 10, compassion: 10, honor: 45 }, goals: ['获得继承承认', '进入核心议会'], shortTermGoal: '主持南特宴会', ambition: '让儿子继承布列塔尼', sourceType: 'attested' }),
        char_alan_iv: character({ id: 'char_alan_iv', nameKey: 'character.alanIV', originalName: 'Alan Fergant', birthDate: '1063-01-01', sex: 'male', houseId: 'house_cornouaille', dynastyId: 'dynasty_cornouaille', parentIds: ['char_hoel', 'char_hawise'], liegeId: 'char_hoel', locationId: 'loc_nantes_castle', traits: ['幼童'], health: 5.6, fertility: 0, goals: ['成长'], sourceType: 'attested' }),
        char_geoffroy: character({ id: 'char_geoffroy', nameKey: 'character.geoffroy', originalName: 'Geoffroy Boterel', birthDate: '1035-01-01', sex: 'male', houseId: 'house_penthievre', dynastyId: 'dynasty_rennes', parentIds: ['char_eudes_penthievre'], titleIds: ['c_penthievre'], liegeId: 'char_conan', locationId: 'loc_penthievre_castle', traits: ['骄傲', '记仇', '坦率'], attributes: { diplomacy: 8, martial: 13, stewardship: 9, intrigue: 8, learning: 6, prowess: 14 }, personality: { boldness: 45, compassion: -20, honor: 30 }, goals: ['家族平反', '减轻征召'], ambition: '恢复潘蒂耶夫尔影响', sourceType: 'attested' }),
        char_eudes_penthievre: character({ id: 'char_eudes_penthievre', nameKey: 'character.eudes', originalName: 'Eudes de Penthièvre', birthDate: '0999-01-01', sex: 'male', houseId: 'house_penthievre', dynastyId: 'dynasty_rennes', childIds: ['char_geoffroy'], liegeId: 'char_conan', locationId: 'loc_penthievre_castle', traits: ['年迈', '老练', '家族本位'], health: 2.4, fertility: 0.15, attributes: { diplomacy: 12, martial: 9, stewardship: 10, intrigue: 14, learning: 8, prowess: 5 }, personality: { boldness: 5, compassion: -5, honor: 20 }, goals: ['守住家族遗产'], sourceType: 'attested' }),
        char_morvan: character({ id: 'char_morvan', nameKey: 'character.morvan', originalName: 'Morvan de Léon', birthDate: '1028-01-01', sex: 'male', houseId: 'house_leon', dynastyId: 'dynasty_leon', titleIds: ['c_leon'], liegeId: 'char_conan', locationId: 'loc_leon_castle', traits: ['尚武', '地方主义', '勇敢'], attributes: { diplomacy: 7, martial: 15, stewardship: 8, intrigue: 7, learning: 5, prowess: 16 }, personality: { boldness: 70, compassion: -5, honor: 25 }, goals: ['军事自治', '边防补贴'], ambition: '成为布列塔尼元帅', sourceType: 'composite' }),
        char_jean_dol: character({ id: 'char_jean_dol', nameKey: 'character.jeanDol', originalName: 'Jean de Dol', birthDate: '1025-01-01', sex: 'male', houseId: 'house_dol', dynastyId: 'dynasty_dol', liegeId: 'char_conan', locationId: 'loc_penthievre_abbey', traits: ['煽动者', '老练', '狡猾'], attributes: { diplomacy: 12, martial: 7, stewardship: 8, intrigue: 16, learning: 10, prowess: 6 }, personality: { boldness: 35, compassion: -30, honor: -25 }, goals: ['限制公爵征税与征召'], ambition: '迫使公爵接受降权', sourceType: 'composite' }),
        char_alan: character({ id: 'char_alan', nameKey: 'character.alan', originalName: 'Alain de Rennes', birthDate: '1020-01-01', sex: 'male', houseId: 'house_rennes_minor', dynastyId: 'dynasty_rennes_minor', liegeId: 'char_conan', locationId: 'loc_rennes_castle', traits: ['忠诚', '守成', '诚实'], attributes: { diplomacy: 10, martial: 12, stewardship: 9, intrigue: 6, learning: 7, prowess: 11 }, personality: { boldness: 5, compassion: 25, honor: 75 }, goals: ['维持宫廷秩序'], ambition: '守护雷恩', sourceType: 'original' }),
        char_mael: character({ id: 'char_mael', nameKey: 'character.mael', originalName: 'Maël, abbé de Saint-Melaine', birthDate: '1018-01-01', sex: 'male', houseId: 'house_church', dynastyId: 'dynasty_none', liegeId: 'char_conan', locationId: 'loc_rennes_abbey', traits: ['博学', '野心', '冷静'], attributes: { diplomacy: 11, martial: 4, stewardship: 10, intrigue: 12, learning: 17, prowess: 3 }, personality: { boldness: 10, compassion: 15, honor: 15 }, goals: ['扩大教会影响'], ambition: '成为公爵首席顾问', sourceType: 'original' }),
        char_isabeau: character({ id: 'char_isabeau', nameKey: 'character.isabeau', originalName: 'Isabeau de Retz', birthDate: '1044-03-02', sex: 'female', houseId: 'house_retz', dynastyId: 'dynasty_retz', liegeId: 'char_hoel', locationId: 'loc_nantes_castle', traits: ['敏锐', '宫廷诗人', '善辩'], attributes: { diplomacy: 15, martial: 3, stewardship: 9, intrigue: 13, learning: 12, prowess: 2 }, personality: { boldness: 15, compassion: 20, honor: 5 }, goals: ['获得稳定宫廷职位'], ambition: '成为布列塔尼编年史家', sourceType: 'original' }),
        char_yves: character({ id: 'char_yves', nameKey: 'character.yves', originalName: 'Yves de Rennes', birthDate: '1031-01-01', sex: 'male', houseId: 'house_rennes_minor', dynastyId: 'dynasty_rennes_minor', liegeId: 'char_conan', locationId: 'loc_rennes_town', traits: ['善辩', '圆滑', '勤勉'], attributes: { diplomacy: 15, martial: 5, stewardship: 12, intrigue: 10, learning: 10, prowess: 5 }, personality: { boldness: -5, compassion: 15, honor: 20 }, goals: ['维持封臣关系'], sourceType: 'original' }),
        char_guethenoc: character({ id: 'char_guethenoc', nameKey: 'character.guethenoc', originalName: 'Guéthenoc de Vannes', birthDate: '1029-01-01', sex: 'male', houseId: 'house_vannes', dynastyId: 'dynasty_vannes', liegeId: 'char_conan', locationId: 'loc_broerec_castle', traits: ['节俭', '谨慎', '地方通'], attributes: { diplomacy: 8, martial: 7, stewardship: 16, intrigue: 8, learning: 9, prowess: 6 }, personality: { boldness: -25, compassion: 5, honor: 35 }, goals: ['发展瓦讷港'], sourceType: 'original' }),
        char_rhiwallon: character({ id: 'char_rhiwallon', nameKey: 'character.rhiwallon', originalName: 'Rhiwallon de Dol', birthDate: '1038-01-01', sex: 'male', houseId: 'house_dol', dynastyId: 'dynasty_dol', liegeId: 'char_jean_dol', locationId: 'loc_penthievre_abbey', traits: ['激进', '年轻', '多疑'], attributes: { diplomacy: 7, martial: 10, stewardship: 6, intrigue: 12, learning: 6, prowess: 10 }, personality: { boldness: 60, compassion: -20, honor: -5 }, goals: ['壮大降权派系'], sourceType: 'composite' }),
        char_william: character({ id: 'char_william', nameKey: 'character.william', originalName: 'William of Normandy', birthDate: '1028-01-01', sex: 'male', houseId: 'house_normandy', dynastyId: 'dynasty_normandy', spouseIds: ['char_matilda'], childIds: ['char_robert_curthose'], titleIds: ['d_normandy', 'c_avranches', 'c_rouen'], liegeId: 'char_philip', locationId: 'loc_rouen_castle', traits: ['雄心', '军事家', '坚韧'], attributes: { diplomacy: 12, martial: 18, stewardship: 14, intrigue: 13, learning: 9, prowess: 15 }, personality: { boldness: 75, compassion: -20, honor: 30 }, goals: ['渡海争夺英格兰'], ambition: '成为英格兰国王', sourceType: 'attested' }),
        char_matilda: character({ id: 'char_matilda', nameKey: 'character.matilda', originalName: 'Matilda of Flanders', birthDate: '1031-01-01', sex: 'female', houseId: 'house_flanders', dynastyId: 'dynasty_flanders', spouseIds: ['char_william'], childIds: ['char_robert_curthose'], liegeId: 'char_william', locationId: 'loc_rouen_castle', traits: ['威严', '聪慧', '家族本位'], attributes: { diplomacy: 15, martial: 6, stewardship: 14, intrigue: 11, learning: 11, prowess: 3 }, personality: { boldness: 25, compassion: 20, honor: 45 }, goals: ['巩固诺曼王朝'], sourceType: 'attested' }),
        char_robert_curthose: character({ id: 'char_robert_curthose', nameKey: 'character.robertCurthose', originalName: 'Robert Curthose', birthDate: '1051-01-01', sex: 'male', houseId: 'house_normandy', dynastyId: 'dynasty_normandy', parentIds: ['char_william', 'char_matilda'], liegeId: 'char_william', locationId: 'loc_rouen_castle', traits: ['躁动', '勇武', '骄傲'], attributes: { diplomacy: 8, martial: 12, stewardship: 7, intrigue: 6, learning: 6, prowess: 13 }, personality: { boldness: 55, compassion: 5, honor: 20 }, goals: ['获得自己的领地'], sourceType: 'attested' }),
        char_robert_mortain: character({ id: 'char_robert_mortain', nameKey: 'character.robertMortain', originalName: 'Robert de Mortain', birthDate: '1031-01-01', sex: 'male', houseId: 'house_conteville', dynastyId: 'dynasty_conteville', spouseIds: ['char_emma_mortain'], titleIds: ['c_mortain'], liegeId: 'char_william', locationId: 'loc_mortain_castle', traits: ['忠诚', '军事家', '谨慎'], attributes: { diplomacy: 9, martial: 14, stewardship: 10, intrigue: 8, learning: 6, prowess: 13 }, personality: { boldness: 30, compassion: 0, honor: 60 }, goals: ['支持威廉远征'], sourceType: 'attested' }),
        char_emma_mortain: character({ id: 'char_emma_mortain', nameKey: 'character.emmaMortain', originalName: 'Emma de Montgomery', birthDate: '1038-01-01', sex: 'female', houseId: 'house_montgomery', dynastyId: 'dynasty_montgomery', spouseIds: ['char_robert_mortain'], liegeId: 'char_robert_mortain', locationId: 'loc_mortain_castle', traits: ['谨慎', '虔诚', '勤勉'], attributes: { diplomacy: 10, martial: 3, stewardship: 13, intrigue: 8, learning: 11, prowess: 2 }, personality: { boldness: -20, compassion: 25, honor: 55 }, goals: ['维护家族'], sourceType: 'attested' }),
        char_odo: character({ id: 'char_odo', nameKey: 'character.odo', originalName: 'Odo of Bayeux', birthDate: '1036-01-01', sex: 'male', houseId: 'house_conteville', dynastyId: 'dynasty_conteville', titleIds: ['c_bayeux'], liegeId: 'char_william', locationId: 'loc_bayeux_abbey', traits: ['野心', '神职', '奢华'], attributes: { diplomacy: 12, martial: 10, stewardship: 11, intrigue: 15, learning: 13, prowess: 8 }, personality: { boldness: 45, compassion: -20, honor: -15 }, goals: ['从征服中获利'], sourceType: 'attested' }),
        char_richard_evreux: character({ id: 'char_richard_evreux', nameKey: 'character.richardEvreux', originalName: 'Richard d’Évreux', birthDate: '1037-01-01', sex: 'male', houseId: 'house_evreux', dynastyId: 'dynasty_normandy', titleIds: ['c_evreux'], liegeId: 'char_william', locationId: 'loc_evreux_castle', traits: ['谨慎', '尽责', '守成'], goals: ['守卫诺曼东境'], sourceType: 'composite' }),
        char_william_eu: character({ id: 'char_william_eu', nameKey: 'character.williamEu', originalName: 'Guillaume d’Eu', birthDate: '1034-01-01', sex: 'male', houseId: 'house_eu', dynastyId: 'dynasty_normandy', titleIds: ['c_eu'], liegeId: 'char_william', locationId: 'loc_eu_castle', traits: ['好战', '骄傲', '野心'], goals: ['获得英格兰领地'], sourceType: 'composite' }),
        char_geoffrey_anjou: character({ id: 'char_geoffrey_anjou', nameKey: 'character.geoffreyAnjou', originalName: 'Geoffroy III d’Anjou', birthDate: '1040-01-01', sex: 'male', houseId: 'house_anjou', dynastyId: 'dynasty_gatinais', spouseIds: ['char_ermengarde'], titleIds: ['c_anjou', 'c_maine', 'c_perche', 'c_alencon'], liegeId: 'char_philip', locationId: 'loc_anjou_castle', traits: ['迟疑', '温和', '守成'], attributes: { diplomacy: 10, martial: 7, stewardship: 11, intrigue: 8, learning: 8, prowess: 6 }, personality: { boldness: -35, compassion: 25, honor: 20 }, goals: ['维持边区影响'], ambition: '稳定安茹继承', sourceType: 'attested' }),
        char_ermengarde: character({ id: 'char_ermengarde', nameKey: 'character.ermengarde', originalName: 'Ermengarde d’Anjou', birthDate: '1042-01-01', sex: 'female', houseId: 'house_anjou', dynastyId: 'dynasty_gatinais', spouseIds: ['char_geoffrey_anjou'], liegeId: 'char_geoffrey_anjou', locationId: 'loc_anjou_castle', traits: ['敏锐', '果断', '家族本位'], goals: ['保护安茹'], sourceType: 'composite' }),
        char_philip: character({ id: 'char_philip', nameKey: 'character.philip', originalName: 'Philippe I de France', birthDate: '1052-05-23', sex: 'male', houseId: 'house_capet', dynastyId: 'dynasty_capet', spouseIds: ['char_bertha'], titleIds: ['k_france'], liegeId: null, locationId: 'loc_evreux_castle', traits: ['年轻国王', '谨慎', '享乐'], goals: ['维护王室宗主权'], sourceType: 'attested' }),
        char_bertha: character({ id: 'char_bertha', nameKey: 'character.bertha', originalName: 'Bertha of Holland', birthDate: '1055-01-01', sex: 'female', houseId: 'house_holland', dynastyId: 'dynasty_gerulfing', spouseIds: ['char_philip'], liegeId: 'char_philip', locationId: 'loc_evreux_castle', traits: ['年轻', '虔诚', '温和'], goals: ['建立王室家庭'], sourceType: 'attested' }),
        char_baldwin: character({ id: 'char_baldwin', nameKey: 'character.baldwin', originalName: 'Baldwin V of Flanders', birthDate: '1012-01-01', sex: 'male', houseId: 'house_flanders', dynastyId: 'dynasty_flanders', childIds: ['char_matilda'], liegeId: 'char_philip', locationId: 'loc_eu_castle', traits: ['老练', '富有', '外交家'], goals: ['维护佛兰德斯平衡'], sourceType: 'attested' }),
        char_richilda: character({ id: 'char_richilda', nameKey: 'character.richilda', originalName: 'Richilde of Hainaut', birthDate: '1018-01-01', sex: 'female', houseId: 'house_hainaut', dynastyId: 'dynasty_reginar', liegeId: 'char_baldwin', locationId: 'loc_eu_castle', traits: ['强势', '精明', '护子'], goals: ['扩大埃诺影响'], sourceType: 'attested' }),
        char_harold: character({ id: 'char_harold', nameKey: 'character.harold', originalName: 'Harold Godwinson', birthDate: '1022-01-01', sex: 'male', houseId: 'house_godwin', dynastyId: 'dynasty_godwin', spouseIds: ['char_edith'], titleIds: ['k_england'], liegeId: null, locationId: 'loc_rouen_port', traits: ['果断', '军事家', '受欢迎'], goals: ['守住英格兰王位'], sourceType: 'attested' }),
        char_edith: character({ id: 'char_edith', nameKey: 'character.edith', originalName: 'Edith Swannesha', birthDate: '1025-01-01', sex: 'female', houseId: 'house_godwin', dynastyId: 'dynasty_godwin', spouseIds: ['char_harold'], liegeId: 'char_harold', locationId: 'loc_rouen_port', traits: ['忠诚', '坚韧', '家族本位'], goals: ['保护子女'], sourceType: 'attested' }),
        char_malcolm: character({ id: 'char_malcolm', nameKey: 'character.malcolm', originalName: 'Malcolm III of Scotland', birthDate: '1031-01-01', sex: 'male', houseId: 'house_dunkeld', dynastyId: 'dynasty_dunkeld', liegeId: null, locationId: 'loc_avranches_port', traits: ['强硬', '雄心', '好战'], goals: ['巩固苏格兰'], sourceType: 'attested' }),
        char_guillaume_aquitaine: character({ id: 'char_guillaume_aquitaine', nameKey: 'character.guillaumeAquitaine', originalName: 'Guillaume VIII d’Aquitaine', birthDate: '1025-01-01', sex: 'male', houseId: 'house_poitiers', dynastyId: 'dynasty_ramnulfid', spouseIds: ['char_agnes'], liegeId: 'char_philip', locationId: 'loc_anjou_town', traits: ['富有', '文化赞助者', '独立'], goals: ['维持南方自治'], sourceType: 'attested' }),
        char_agnes: character({ id: 'char_agnes', nameKey: 'character.agnes', originalName: 'Agnès de Bourgogne', birthDate: '1035-01-01', sex: 'female', houseId: 'house_burgundy', dynastyId: 'dynasty_ivrea', spouseIds: ['char_guillaume_aquitaine'], liegeId: 'char_guillaume_aquitaine', locationId: 'loc_anjou_town', traits: ['虔诚', '善辩', '谨慎'], goals: ['维护阿基坦家族'], sourceType: 'attested' }),
    };
    const titleHolders = Object.fromEntries(countyInputs.map(item => [`c_${item.id}`, item.holderId]));
    const titles = {
        d_brittany: { id: 'd_brittany', nameKey: 'title.brittany', rank: 'duchy', holderId: 'char_conan', deJureLiegeId: 'k_france', deFactoLiegeId: null, countyId: null, successionLaw: 'partition' },
        d_normandy: { id: 'd_normandy', nameKey: 'title.normandy', rank: 'duchy', holderId: 'char_william', deJureLiegeId: 'k_france', deFactoLiegeId: 'k_france', countyId: null, successionLaw: 'primogeniture' },
        k_france: { id: 'k_france', nameKey: 'title.france', rank: 'kingdom', holderId: 'char_philip', deJureLiegeId: null, deFactoLiegeId: null, countyId: null, successionLaw: 'primogeniture' },
        k_england: { id: 'k_england', nameKey: 'title.england', rank: 'kingdom', holderId: 'char_harold', deJureLiegeId: null, deFactoLiegeId: null, countyId: null, successionLaw: 'primogeniture' },
    };
    for (const county of countyInputs)
        titles[`c_${county.id}`] = { id: `c_${county.id}`, nameKey: `county.${county.id}`, rank: 'county', holderId: titleHolders[`c_${county.id}`], deJureLiegeId: county.deJureLiegeId, deFactoLiegeId: county.deJureLiegeId, countyId: county.id, successionLaw: 'partition' };
    const counties = {};
    const locations = {};
    for (const input of countyInputs) {
        const locationIds = [`loc_${input.id}_castle`, `loc_${input.id}_town`, `loc_${input.id}_abbey`];
        if (['nantes', 'broerec', 'rouen', 'avranches', 'eu', 'leon'].includes(input.id))
            locationIds.push(`loc_${input.id}_port`);
        counties[input.id] = { id: input.id, nameKey: `county.${input.id}`, originalName: input.originalName, titleId: `c_${input.id}`, polygon: input.polygon, centroid: input.centroid, adjacentCountyIds: input.adjacent, locationIds, controllerTitleId: `c_${input.id}`, occupation: null, control: 100, terrain: input.terrain, development: Math.round(input.tax * 4), baseTax: input.tax, baseLevies: input.levies, buildingIds: [] };
        const [x, y] = input.centroid;
        locations[locationIds[0]] = { id: locationIds[0], countyId: input.id, nameKey: `${t(`county.${input.id}`)}城堡`, kind: 'castle', position: [x, y] };
        locations[locationIds[1]] = { id: locationIds[1], countyId: input.id, nameKey: `${t(`county.${input.id}`)}市镇`, kind: 'city', position: [x + 10, y + 13] };
        locations[locationIds[2]] = { id: locationIds[2], countyId: input.id, nameKey: `${t(`county.${input.id}`)}修道院`, kind: 'temple', position: [x - 11, y + 14] };
        if (locationIds[3])
            locations[locationIds[3]] = { id: locationIds[3], countyId: input.id, nameKey: `${t(`county.${input.id}`)}港`, kind: 'port', position: [x - 15, y - 11] };
    }
    const characterResources = {};
    for (const person of Object.values(C)) {
        const countiesHeld = person.titleIds.filter(id => id.startsWith('c_')).length;
        characterResources[person.id] = { gold: person.id === 'char_conan' ? 180 : 60 + countiesHeld * 35, prestige: person.id === 'char_conan' ? 320 : 80 + person.titleIds.length * 50, piety: person.traits.includes('神职') ? 260 : 40, levies: 250 + countiesHeld * 420, income: 1.5 + countiesHeld * 2 };
    }
    characterResources.char_conan = { gold: 180, prestige: 320, piety: 55, levies: 1400, income: 5.5 };
    return GameStateSchema.parse({
        schemaVersion: 2, saveId: `brittany-sandbox-${seed}`, revision: 0, rngState: seed,
        contentPackIds: ['ck.core', 'ck.sandbox.brittany1066'], contentPackVersions: { 'ck.core': '2.0.0', 'ck.sandbox.brittany1066': '2.0.0' },
        clock: { date: '1066-09-15', segment: 'morning' }, currentDate: '1066-09-15', nextRegularPulseAt: '1066-09-22', worldActionCredit: 0,
        playerCharacterId: 'char_conan', regentId: null, activeTravelId: null,
        resources: { gold: 180, prestige: 320, piety: 55, legitimacy: 58, stress: 20, levies: 1400 }, characterResources, settings: {},
        characters: C, titles, counties, locations,
        knowledge: { fact_jean_rebel: { id: 'fact_jean_rebel', subjectId: 'char_jean_dol', predicate: 'organized_faction', value: true, certainty: 'confirmed', sourceId: 'council', observedAt: '1066-09-15', visibility: 'public' } }, memories: {}, relationshipModifiers: [], promises: {}, supportCommitments: {},
        factions: { faction_liberty: { id: 'faction_liberty', nameKey: 'faction.liberty', kind: 'liberty', leaderId: 'char_jean_dol', memberIds: ['char_jean_dol', 'char_rhiwallon'], targetId: 'char_conan', issueId: 'ducal_authority', power: 67, threshold: 60, deadline: '1066-09-29', status: 'organizing', createdAt: '1066-09-01' } },
        activities: { activity_feast_nantes_1066: { id: 'activity_feast_nantes_1066', type: 'feast', hostId: 'char_hoel', participantIds: ['char_hoel', 'char_hawise', 'char_isabeau'], invitedIds: ['char_conan', 'char_geoffroy', 'char_morvan'], locationId: 'loc_nantes_castle', phase: 'planned', startedAt: '1066-09-20', endsAt: null, status: 'planned', intent: 'political_reconciliation', memoryIds: [] } },
        communications: {}, travels: {}, projects: {}, wars: {},
        council: {
            council_chancellor: { id: 'council_chancellor', liegeId: 'char_conan', kind: 'chancellor', holderId: 'char_yves', task: '改善封臣关系', appointedAt: '1066-09-15' },
            council_marshal: { id: 'council_marshal', liegeId: 'char_conan', kind: 'marshal', holderId: 'char_alan', task: '组织军队', appointedAt: '1066-09-15' },
            council_steward: { id: 'council_steward', liegeId: 'char_conan', kind: 'steward', holderId: 'char_guethenoc', task: '管理亲领', appointedAt: '1066-09-15' },
            council_spymaster: { id: 'council_spymaster', liegeId: 'char_conan', kind: 'spymaster', holderId: null, task: null, appointedAt: null },
            council_chaplain: { id: 'council_chaplain', liegeId: 'char_conan', kind: 'chaplain', holderId: 'char_mael', task: '宗教关系', appointedAt: '1066-09-15' },
            council_regent: { id: 'council_regent', liegeId: 'char_conan', kind: 'regent', holderId: null, task: null, appointedAt: null },
        },
        contracts: {
            contract_hoel: { id: 'contract_hoel', liegeId: 'char_conan', vassalId: 'char_hoel', taxLevel: 'normal', levyLevel: 'normal', privileges: [], modifiedAt: '1066-09-15' },
            contract_geoffroy: { id: 'contract_geoffroy', liegeId: 'char_conan', vassalId: 'char_geoffroy', taxLevel: 'normal', levyLevel: 'high', privileges: [], modifiedAt: '1066-09-15' },
            contract_morvan: { id: 'contract_morvan', liegeId: 'char_conan', vassalId: 'char_morvan', taxLevel: 'low', levyLevel: 'high', privileges: ['local_command'], modifiedAt: '1066-09-15' },
        },
        claims: {
            claim_william_england: { id: 'claim_william_england', claimantId: 'char_william', titleId: 'k_england', strength: 'pressed', inherited: true, createdAt: '1066-01-05' },
            claim_hawise_brittany: { id: 'claim_hawise_brittany', claimantId: 'char_hawise', titleId: 'd_brittany', strength: 'implicit', inherited: true, createdAt: '1066-09-15' },
            claim_geoffroy_brittany: { id: 'claim_geoffroy_brittany', claimantId: 'char_geoffroy', titleId: 'd_brittany', strength: 'weak', inherited: true, createdAt: '1066-09-15' },
            claim_conan_avranches: { id: 'claim_conan_avranches', claimantId: 'char_conan', titleId: 'c_avranches', strength: 'weak', inherited: false, createdAt: '1066-09-15' },
            claim_geoffroy_rennes: { id: 'claim_geoffroy_rennes', claimantId: 'char_geoffroy', titleId: 'c_rennes', strength: 'weak', inherited: true, createdAt: '1066-09-15' },
        },
        marriages: {
            marriage_hoel_hawise: { id: 'marriage_hoel_hawise', partnerIds: ['char_hoel', 'char_hawise'], status: 'married', allianceIds: ['alliance_cornouaille_rennes'], createdAt: '1058-01-01', resolvedAt: '1058-01-01' },
            marriage_william_matilda: { id: 'marriage_william_matilda', partnerIds: ['char_william', 'char_matilda'], status: 'married', allianceIds: ['alliance_normandy_flanders'], createdAt: '1051-01-01', resolvedAt: '1051-01-01' },
            marriage_philip_bertha: { id: 'marriage_philip_bertha', partnerIds: ['char_philip', 'char_bertha'], status: 'married', allianceIds: [], createdAt: '1064-01-01', resolvedAt: '1064-01-01' },
            marriage_mortain: { id: 'marriage_mortain', partnerIds: ['char_robert_mortain', 'char_emma_mortain'], status: 'married', allianceIds: [], createdAt: '1058-01-01', resolvedAt: '1058-01-01' },
            marriage_anjou: { id: 'marriage_anjou', partnerIds: ['char_geoffrey_anjou', 'char_ermengarde'], status: 'married', allianceIds: [], createdAt: '1060-01-01', resolvedAt: '1060-01-01' },
        },
        succession: {
            succession_brittany: { titleId: 'd_brittany', law: 'partition', heirIds: ['char_hawise', 'char_alan_iv'], updatedAt: '1066-09-15' },
            succession_normandy: { titleId: 'd_normandy', law: 'primogeniture', heirIds: ['char_robert_curthose'], updatedAt: '1066-09-15' },
            succession_france: { titleId: 'k_france', law: 'primogeniture', heirIds: [], updatedAt: '1066-09-15' },
        },
        externalRealms: {
            realm_england: { id: 'realm_england', nameKey: 'external.england', rulerId: 'char_harold', heirId: null, strength: 8200, stability: 54, stanceToPlayer: 'neutral', warSummary: '诺曼宣称正在形成', pressure: 78, lastSimulatedAt: '1066-09-15' },
            realm_france: { id: 'realm_france', nameKey: 'external.france', rulerId: 'char_philip', heirId: null, strength: 6500, stability: 61, stanceToPlayer: 'wary', warSummary: null, pressure: 35, lastSimulatedAt: '1066-09-15' },
            realm_flanders: { id: 'realm_flanders', nameKey: 'external.flanders', rulerId: 'char_baldwin', heirId: null, strength: 4200, stability: 77, stanceToPlayer: 'neutral', warSummary: null, pressure: 22, lastSimulatedAt: '1066-09-15' },
            realm_aquitaine: { id: 'realm_aquitaine', nameKey: 'external.aquitaine', rulerId: 'char_guillaume_aquitaine', heirId: null, strength: 5800, stability: 70, stanceToPlayer: 'neutral', warSummary: null, pressure: 12, lastSimulatedAt: '1066-09-15' },
            realm_scotland: { id: 'realm_scotland', nameKey: 'external.scotland', rulerId: 'char_malcolm', heirId: null, strength: 3900, stability: 58, stanceToPlayer: 'neutral', warSummary: null, pressure: 18, lastSimulatedAt: '1066-09-15' },
            realm_papacy: { id: 'realm_papacy', nameKey: 'external.papacy', rulerId: 'char_mael', heirId: null, strength: 1200, stability: 80, stanceToPlayer: 'neutral', warSummary: null, pressure: 15, lastSimulatedAt: '1066-09-15' },
        },
        situations: { situation_liberty_1066: { id: 'situation_liberty_1066', definitionId: 'situation.liberty_crisis_1066', nameKey: 'situation.liberty', participantIds: ['char_conan', 'char_jean_dol', 'char_hoel', 'char_geoffroy', 'char_morvan'], phase: 'organizing', startedAt: '1066-09-15', deadline: '1066-09-29', status: 'active', metrics: { requiredSupport: 2, currentSupport: 0, factionPower: 67 }, flags: { feastOptional: true }, resolution: null, sourcePackId: 'ck.sandbox.brittany1066' } },
        pendingEvents: {},
        notifications: {
            alert_liberty: { id: 'alert_liberty', kind: 'situation', title: '降权派系正在组织', body: '多勒集团将在两周内提出限制公爵权力的最后通牒。赴宴只是其中一种解决方式。', createdAt: '1066-09-15', severity: 'danger', relatedIds: ['situation_liberty_1066', 'faction_liberty'], read: false },
            alert_spymaster: { id: 'alert_spymaster', kind: 'task', title: '间谍总管职位空缺', body: '空缺职位会削弱秘密与阴谋防御。', createdAt: '1066-09-15', severity: 'warning', relatedIds: ['council_spymaster'], read: false },
            invite_feast: { id: 'invite_feast', kind: 'message', title: '南特宴会邀请', body: '霍埃尔邀请你在九月二十日赴南特。你可以赴宴，也可以完全忽略。', createdAt: '1066-09-15', severity: 'info', relatedIds: ['activity_feast_nantes_1066', 'char_hoel'], read: false },
        },
        interactions: {}, signals: [], eventLog: [],
    });
}
const countyIds = countyInputs.map(item => item.id);
const initialSandboxDate = '1066-09-15';
const initialLibertyDeadline = addDays(initialSandboxDate, 14);

;// ./src/ck/domain/selectors.ts
/* unused harmony import specifier */ var selectors_ageOnDate;
/* unused harmony import specifier */ var selectors_daysBetween;

function relationshipValue(state, fromId, toId, dimension) {
    return state.relationshipModifiers.filter(item => item.fromId === fromId && item.toId === toId && item.dimension === dimension)
        .filter(item => item.expiresAt === null || item.expiresAt >= state.currentDate).reduce((sum, item) => sum + item.delta, 0);
}
function isPromiseEffective(state, promiseId) {
    const promise = state.promises[promiseId];
    return Boolean(promise && (promise.status === 'fulfilled' || (promise.status === 'active' && promise.dueDate >= state.currentDate)));
}
function activeSupports(state) {
    return Object.values(state.supportCommitments).filter(item => item.status === 'active' && item.expiresAt >= state.currentDate && item.conditionPromiseIds.every(id => isPromiseEffective(state, id)));
}
function supportCount(state, issueId = 'ducal_authority') {
    return new Set(activeSupports(state).filter(item => item.issueId === issueId).map(item => item.supporterId)).size;
}
function libertySituation(state) {
    return Object.values(state.situations).find(item => item.definitionId === 'situation.liberty_crisis_1066') ?? null;
}
function deadlineDays(state) { return daysUntilDeadline(state); }
function characterAge(state, characterId) { const person = state.characters[characterId]; return person ? selectors_ageOnDate(person.birthDate, state.currentDate) : -1; }
function countyForLocation(state, locationId) { return state.locations[locationId]?.countyId ?? null; }
function findCountyPath(state, fromCountyId, toCountyId) {
    if (fromCountyId === toCountyId)
        return [fromCountyId];
    const queue = [[fromCountyId]];
    const seen = new Set([fromCountyId]);
    while (queue.length) {
        const path = queue.shift();
        const current = path[path.length - 1];
        for (const next of state.counties[current]?.adjacentCountyIds ?? []) {
            if (seen.has(next))
                continue;
            const candidate = [...path, next];
            if (next === toCountyId)
                return candidate;
            seen.add(next);
            queue.push(candidate);
        }
    }
    return null;
}
function nextScheduledDate(state) {
    const dates = [state.nextRegularPulseAt];
    for (const item of Object.values(state.situations))
        if (item.status === 'active' && item.deadline && item.deadline > state.currentDate)
            dates.push(item.deadline);
    for (const item of Object.values(state.activities))
        if (item.status === 'planned' && item.startedAt > state.currentDate)
            dates.push(item.startedAt);
    for (const item of Object.values(state.communications))
        if (item.status === 'in_transit' && item.deliverAt > state.currentDate)
            dates.push(item.deliverAt);
    for (const item of Object.values(state.travels))
        if (item.status === 'travelling' && item.arriveAt > state.currentDate)
            dates.push(item.arriveAt);
    return dates.sort()[0] ?? null;
}
function daysToNextScheduled(state) { const date = nextScheduledDate(state); return date ? Math.max(1, selectors_daysBetween(state.currentDate, date)) : 7; }
function realmTopLiegeTitleId(state, titleId) {
    let current = state.titles[titleId];
    const seen = new Set();
    while (current?.deFactoLiegeId && !seen.has(current.id)) {
        seen.add(current.id);
        const next = state.titles[current.deFactoLiegeId];
        if (!next)
            break;
        current = next;
    }
    return current?.id ?? titleId;
}
function countyRealmId(state, countyId) {
    const title = state.titles[state.counties[countyId]?.titleId];
    return title ? realmTopLiegeTitleId(state, title.id) : 'none';
}
function primaryTitle(state, characterId) {
    const rank = { barony: 0, county: 1, duchy: 2, kingdom: 3, empire: 4 };
    return state.characters[characterId]?.titleIds.map(id => state.titles[id]).filter(Boolean).sort((a, b) => rank[b.rank] - rank[a.rank])[0] ?? null;
}
function projectScene(state, sceneId, locationId, requestedCharacterIds, interactionId) {
    const interaction = interactionId ? state.interactions[interactionId] ?? null : null;
    const participantIds = interaction ? [interaction.initiatorId, interaction.targetId] : [];
    const localIds = [...new Set([...participantIds, ...requestedCharacterIds.filter(id => state.characters[id]?.alive && state.characters[id].locationId === locationId)])].filter(id => state.characters[id]?.alive).slice(0, 3);
    const visibleFacts = Object.values(state.knowledge).filter(fact => fact.visibility === 'public' || state.characters[state.playerCharacterId]?.knowledgeIds.includes(fact.id));
    return { date: state.currentDate, segment: state.clock.segment, sceneId, locationId, activeCharacterIds: localIds,
        characters: localIds.map(id => ({ id, name: state.characters[id].nameKey, traits: state.characters[id].traits, goal: state.characters[id].shortTermGoal, ambition: state.characters[id].ambition, opinionOfPlayer: relationshipValue(state, id, state.playerCharacterId, 'opinion'), trustOfPlayer: relationshipValue(state, id, state.playerCharacterId, 'trust') })),
        publicFacts: visibleFacts.map(({ subjectId, predicate, value, certainty }) => ({ subjectId, predicate, value, certainty })),
        player: { id: state.playerCharacterId, resources: state.resources, titles: state.characters[state.playerCharacterId]?.titleIds ?? [] },
        situations: Object.values(state.situations).filter(item => item.status === 'active').map(item => ({ id: item.id, phase: item.phase, deadline: item.deadline, metrics: item.metrics })),
        interaction };
}
function livingBloodHeirs(state, deceasedId) {
    const deceased = state.characters[deceasedId];
    if (!deceased)
        return [];
    const descendants = [];
    const queue = [...deceased.childIds];
    const seen = new Set();
    while (queue.length) {
        const id = queue.shift();
        if (seen.has(id))
            continue;
        seen.add(id);
        const person = state.characters[id];
        if (!person)
            continue;
        if (person.alive)
            descendants.push(id);
        queue.push(...person.childIds);
    }
    const siblings = Object.values(state.characters).filter(person => person.id !== deceasedId && person.alive && person.parentIds.some(id => deceased.parentIds.includes(id))).map(person => person.id);
    const broader = Object.values(state.characters).filter(person => person.id !== deceasedId && person.alive && (person.dynastyId === deceased.dynastyId || person.houseId === deceased.houseId)).map(person => person.id);
    const designated = deceased.titleIds.flatMap(titleId => Object.values(state.succession).find(line => line.titleId === titleId)?.heirIds ?? []).filter(id => state.characters[id]?.alive);
    const byAge = (ids) => ids.sort((a, b) => characterAge(state, b) - characterAge(state, a));
    return [...new Set([...designated, ...byAge(descendants), ...byAge(siblings), ...byAge(broader)])];
}
function unreadNotifications(state) { return Object.values(state.notifications).filter(item => !item.read).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
function pendingPlayerEvent(state) { return Object.values(state.pendingEvents).filter(item => item.status === 'pending' && item.requiresResponse).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0] ?? null; }

;// ./src/ck/persistence/save.ts
/* unused harmony import specifier */ var save_GameStateSchema;




const ChronicleEntrySchema = object({ id: schemas_string(), date: schemas_string(), kind: schemas_enum(['system', 'speech', 'event', 'error']), title: schemas_string(), text: schemas_string() }).strict();
const ChronicleSchema = array(ChronicleEntrySchema).max(500);
const BranchAnchorSchema = object({ messageId: schemas_number().int().nonnegative(), kind: schemas_enum(['manual', 'scene']), checkpointId: schemas_string(), revision: schemas_number().int().nonnegative() }).strict();
const CheckpointSchema = object({ id: schemas_string(), name: schemas_string(), createdAt: schemas_string(), important: schemas_boolean(), state: GameStateSchema.nullable(), chronicle: ChronicleSchema, stateHash: schemas_string(), compatible: schemas_boolean(), migrationError: schemas_string().nullable() }).strict();
const HistorySnapshotSchema = object({ saveId: schemas_string(), checkpointId: schemas_string(), revision: schemas_number().int().nonnegative(), state: GameStateSchema, chronicle: ChronicleSchema, stateHash: schemas_string() }).strict();
const PublicProjectionSchema = object({
    schemaVersion: literal(2), saveId: schemas_string(), revision: schemas_number().int().nonnegative(), date: schemas_string(), segment: schemas_string(),
    player: object({ id: schemas_string(), name: schemas_string(), location: schemas_string(), primaryTitle: schemas_string().nullable(), titles: array(schemas_string()) }).strict(),
    resources: object({ gold: schemas_number(), prestige: schemas_number(), piety: schemas_number(), legitimacy: schemas_number(), stress: schemas_number(), levies: schemas_number() }).strict(),
    politics: object({ activeSituations: schemas_number(), libertyStatus: schemas_string(), factionPower: schemas_number(), support: schemas_number(), ultimatumDays: schemas_number(), activeWars: schemas_number() }).strict(),
    pending: object({ events: schemas_number(), letters: schemas_number(), interactions: schemas_number(), promises: schemas_number(), notifications: schemas_number(), worldSignals: schemas_number() }).strict(),
}).strict();
const SaveEnvelopeSchema = object({ format: literal('ck-lord-rpg-save'), formatVersion: literal(3), state: GameStateSchema, chronicle: ChronicleSchema, checkpoints: array(CheckpointSchema).max(10), eventHash: schemas_string(), stateHash: schemas_string(), branchAnchor: BranchAnchorSchema.nullable() }).strict();
const LegacyEnvelopeSchema = object({ format: literal('ck-lord-rpg-save'), formatVersion: union([literal(1), literal(2)]), state: unknown(), chronicle: array(unknown()).optional(), checkpoints: array(unknown()).max(10).default([]), eventHash: schemas_string(), stateHash: schemas_string().optional(), branchAnchor: unknown().optional() }).passthrough();
const LegacyCheckpointSchema = object({ id: schemas_string(), name: schemas_string(), createdAt: schemas_string(), important: schemas_boolean(), state: unknown(), chronicle: array(unknown()).optional(), stateHash: schemas_string().optional() }).passthrough();
const variableKey = 'ck_lord_rpg', publicVariableKey = 'ck_lord_rpg_public';
let memoryEnvelope = null;
function hashText(text) { let hash = 2166136261; for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
} return (hash >>> 0).toString(16).padStart(8, '0'); }
function sortForHash(value) { if (Array.isArray(value))
    return value.map(sortForHash); if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortForHash(item)])); return value; }
function stableStringify(value) { return JSON.stringify(sortForHash(value)); }
function hashGameState(state) { return hashText(stableStringify(state)); }
function rawEventLog(raw) { if (!raw || typeof raw !== 'object')
    return []; const value = raw.eventLog; return Array.isArray(value) ? value : []; }
function hashRawEvents(raw, stable = true) { const compact = rawEventLog(raw).map(item => { const event = item; return [event.id, event.revision, event.type, event.payload]; }); return hashText(stable ? stableStringify(compact) : JSON.stringify(compact)); }
function hashEventLog(state) { return hashRawEvents(state); }
function validStateSemantics(state) { const ids = new Set(); return state.eventLog.every(item => { if (item.revision > state.revision || ids.has(item.id))
    return false; ids.add(item.id); return true; }); }
function hasTavernVariables() { return typeof getVariables === 'function' && typeof updateVariablesWith === 'function'; }
function cloneState(state) { return save_GameStateSchema.parse(JSON.parse(JSON.stringify(state))); }
function normalizeChronicle(raw) { const input = Array.isArray(raw) ? raw : []; const valid = input.flatMap(item => { const parsed = ChronicleEntrySchema.safeParse(item); return parsed.success ? [parsed.data] : []; }); return ChronicleSchema.parse(valid.slice(-500)); }
function genericCharacter(id, raw, base) {
    const locationId = typeof raw.locationId === 'string' && base.locations[raw.locationId] ? raw.locationId : 'loc_rennes_castle';
    return { id, nameKey: typeof raw.nameKey === 'string' ? raw.nameKey : id, originalName: typeof raw.originalName === 'string' ? raw.originalName : id, birthDate: typeof raw.birthDate === 'string' ? raw.birthDate : '1030-01-01', deathDate: null, sex: raw.sex === 'female' ? 'female' : 'male', houseId: typeof raw.houseId === 'string' ? raw.houseId : `house_${id}`, dynastyId: typeof raw.dynastyId === 'string' ? raw.dynastyId : `dynasty_${id}`, parentIds: [], childIds: [], spouseIds: [], betrothedIds: [], titleIds: [], liegeId: null, locationId, alive: true, imprisonedById: null, traits: [], attributes: { diplomacy: 8, martial: 8, stewardship: 8, intrigue: 8, learning: 8, prowess: 8 }, personality: { boldness: 0, compassion: 0, honor: 0 }, health: 5, fertility: .5, stress: 0, goals: [], shortTermGoal: null, ambition: null, knowledgeIds: [], memoryIds: [], sourceType: 'original' };
}
function migrateGameState(raw) {
    const current = GameStateSchema.safeParse(raw);
    if (current.success)
        return current.data;
    const legacy = LegacyGameStateSchema.safeParse(raw);
    if (!legacy.success)
        return null;
    const old = legacy.data;
    const base = createInitialState(Number(old.rngState) || 10660915);
    base.saveId = String(old.saveId || base.saveId);
    base.revision = Number(old.revision) || 0;
    base.rngState = Number(old.rngState) || base.rngState;
    base.currentDate = String(old.currentDate || base.currentDate);
    base.clock = { date: base.currentDate, segment: 'morning' };
    base.nextRegularPulseAt = String(old.nextRegularPulseAt || addDaysCompat(base.currentDate, base.settings.regularWorldPulseDays));
    base.worldActionCredit = Number(old.worldActionCredit) || 0;
    base.playerCharacterId = String(old.playerCharacterId || base.playerCharacterId);
    base.regentId = typeof old.regentId === 'string' ? old.regentId : null;
    base.activeTravelId = typeof old.scenario?.activeTravelId === 'string' ? old.scenario.activeTravelId : null;
    if (old.settings && typeof old.settings === 'object')
        base.settings = { ...base.settings, ...old.settings, content: { ...base.settings.content, ...old.settings.content }, models: { ...base.settings.models, ...old.settings.models } };
    if (old.characters && typeof old.characters === 'object')
        for (const [id, value] of Object.entries(old.characters)) {
            const seed = base.characters[id] ?? genericCharacter(id, value, base);
            base.characters[id] = { ...seed, ...value, deathDate: value.deathDate ?? seed.deathDate, childIds: value.childIds ?? seed.childIds, betrothedIds: value.betrothedIds ?? seed.betrothedIds, attributes: { ...seed.attributes, ...(value.attributes ?? {}) }, personality: { ...seed.personality, ...(value.personality ?? {}) }, health: Number(value.health ?? seed.health), fertility: Number(value.fertility ?? seed.fertility), stress: Number(value.stress ?? seed.stress), shortTermGoal: value.shortTermGoal ?? seed.shortTermGoal, ambition: value.ambition ?? seed.ambition, memoryIds: value.memoryIds ?? seed.memoryIds };
        }
    if (old.titles && typeof old.titles === 'object')
        for (const [id, value] of Object.entries(old.titles)) {
            const seed = base.titles[id] ?? { id, nameKey: id, rank: 'county', holderId: null, deJureLiegeId: null, deFactoLiegeId: null, countyId: null, successionLaw: 'partition' };
            base.titles[id] = { ...seed, ...value, successionLaw: value.successionLaw ?? seed.successionLaw };
        }
    if (old.counties && typeof old.counties === 'object')
        for (const [id, value] of Object.entries(old.counties)) {
            if (!base.counties[id])
                continue;
            base.counties[id] = { ...base.counties[id], ...value, terrain: value.terrain ?? base.counties[id].terrain, development: Number(value.development ?? base.counties[id].development), baseTax: Number(value.baseTax ?? base.counties[id].baseTax), baseLevies: Number(value.baseLevies ?? base.counties[id].baseLevies), buildingIds: value.buildingIds ?? base.counties[id].buildingIds };
        }
    if (old.locations && typeof old.locations === 'object')
        for (const [id, value] of Object.entries(old.locations))
            base.locations[id] = { ...base.locations[id], ...value };
    const simpleRecords = ['knowledge', 'relationshipModifiers', 'promises', 'supportCommitments', 'communications', 'travels', 'projects', 'wars', 'signals', 'eventLog'];
    for (const key of simpleRecords)
        if (old[key] !== undefined)
            base[key] = old[key];
    if (old.factions && typeof old.factions === 'object')
        for (const [id, value] of Object.entries(old.factions)) {
            const seed = base.factions[id] ?? base.factions.faction_liberty;
            base.factions[id] = { ...seed, ...value, kind: value.kind ?? seed.kind, deadline: value.deadline ?? seed.deadline, createdAt: value.createdAt ?? '1066-09-01' };
        }
    if (old.activities && typeof old.activities === 'object') {
        for (const [id, value] of Object.entries(old.activities)) {
            const targetId = id === 'feast_nantes' ? 'activity_feast_nantes_1066' : id;
            const seed = base.activities[targetId] ?? { id: targetId, type: 'feast', hostId: value.hostId, participantIds: [], invitedIds: [], locationId: value.locationId, phase: 'planned', startedAt: base.currentDate, endsAt: null, status: 'planned', intent: null, memoryIds: [] };
            base.activities[targetId] = { ...seed, ...value, id: targetId, invitedIds: value.invitedIds ?? seed.invitedIds, endsAt: value.endsAt ?? seed.endsAt, intent: value.intent ?? seed.intent };
        }
    }
    if (old.resources && typeof old.resources === 'object')
        base.resources = { ...base.resources, ...old.resources, piety: Number(old.resources.piety ?? base.resources.piety) };
    const playerWallet = base.characterResources[base.playerCharacterId];
    if (playerWallet) {
        playerWallet.gold = base.resources.gold;
        playerWallet.prestige = base.resources.prestige;
        playerWallet.piety = base.resources.piety;
        playerWallet.levies = base.resources.levies;
    }
    const scenario = old.scenario;
    const situation = base.situations.situation_liberty_1066;
    const result = String(scenario?.result ?? 'pending');
    situation.deadline = String(scenario?.deadline ?? situation.deadline);
    situation.metrics.currentSupport = supportCount(base);
    situation.metrics.factionPower = base.factions.faction_liberty?.power ?? 67;
    situation.phase = String(scenario?.phase ?? 'organizing');
    if (result === 'success') {
        situation.status = 'resolved';
        situation.resolution = 'coalition_split';
    }
    else if (result === 'conceded') {
        situation.status = 'resolved';
        situation.resolution = 'authority_conceded';
    }
    else if (result === 'civil_war') {
        situation.status = 'war';
        situation.resolution = 'war';
    }
    base.contentPackIds = ['ck.core', 'ck.sandbox.brittany1066'];
    base.contentPackVersions = { 'ck.core': '2.0.0', 'ck.sandbox.brittany1066': '2.0.0' };
    const parsed = GameStateSchema.safeParse(base);
    return parsed.success ? parsed.data : null;
}
function addDaysCompat(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function createPublicProjection(state) { const player = state.characters[state.playerCharacterId]; const location = state.locations[player.locationId]; const faction = state.factions.faction_liberty; const situation = libertySituation(state); return PublicProjectionSchema.parse({ schemaVersion: 2, saveId: state.saveId, revision: state.revision, date: state.currentDate, segment: state.clock.segment, player: { id: player.id, name: t(player.nameKey), location: t(location?.nameKey ?? player.locationId), primaryTitle: primaryTitle(state, player.id) ? t(primaryTitle(state, player.id).nameKey) : null, titles: player.titleIds.map(id => t(state.titles[id]?.nameKey ?? id)) }, resources: state.resources, politics: { activeSituations: Object.values(state.situations).filter(item => item.status === 'active').length, libertyStatus: situation?.status ?? 'none', factionPower: faction?.power ?? 0, support: supportCount(state), ultimatumDays: deadlineDays(state), activeWars: Object.values(state.wars).filter(item => !item.endedAt).length }, pending: { events: Object.values(state.pendingEvents).filter(item => item.status === 'pending').length, letters: Object.values(state.communications).filter(item => item.status === 'in_transit').length, interactions: Object.values(state.interactions).filter(item => ['negotiating', 'awaiting_player', 'awaiting_target', 'countered'].includes(item.status)).length, promises: Object.values(state.promises).filter(item => item.status === 'active').length, notifications: Object.values(state.notifications).filter(item => !item.read).length, worldSignals: state.signals.filter(item => !item.consumed).length } }); }
function createEnvelope(state, options = {}) { return SaveEnvelopeSchema.parse({ format: 'ck-lord-rpg-save', formatVersion: 3, state, chronicle: normalizeChronicle(options.chronicle ?? []), checkpoints: (options.checkpoints ?? []).slice(-10), eventHash: hashEventLog(state), stateHash: hashGameState(state), branchAnchor: options.branchAnchor ?? null }); }
function validateEnvelope(envelope) { return envelope.eventHash === hashEventLog(envelope.state) && envelope.stateHash === hashGameState(envelope.state) && validStateSemantics(envelope.state) && envelope.checkpoints.every(item => !item.compatible || Boolean(item.state && item.stateHash === hashGameState(item.state))); }
function migrateEnvelope(raw) { const parsed = LegacyEnvelopeSchema.safeParse(raw); if (!parsed.success)
    return null; const legacy = parsed.data; if (legacy.formatVersion === 2 && legacy.stateHash !== hashText(stableStringify(legacy.state)))
    return null; if (legacy.formatVersion === 2 && legacy.eventHash !== hashRawEvents(legacy.state, true))
    return null; if (legacy.formatVersion === 1 && legacy.eventHash !== hashRawEvents(legacy.state, false))
    return null; const state = migrateGameState(legacy.state); if (!state)
    return null; const chronicle = normalizeChronicle(legacy.chronicle); const checkpoints = legacy.checkpoints.map((rawCheckpoint, index) => { const checkpoint = LegacyCheckpointSchema.safeParse(rawCheckpoint); if (!checkpoint.success)
    return { id: `incompatible_${index}`, name: `无法迁移的检查点 ${index + 1}`, createdAt: new Date(0).toISOString(), important: false, state: null, chronicle: [], stateHash: '', compatible: false, migrationError: '检查点结构无效' }; const migrated = migrateGameState(checkpoint.data.state); if (!migrated)
    return { id: checkpoint.data.id, name: checkpoint.data.name, createdAt: checkpoint.data.createdAt, important: checkpoint.data.important, state: null, chronicle: normalizeChronicle(checkpoint.data.chronicle), stateHash: '', compatible: false, migrationError: '旧状态无法升级到 schemaVersion 2' }; return { id: checkpoint.data.id, name: checkpoint.data.name, createdAt: checkpoint.data.createdAt, important: checkpoint.data.important, state: migrated, chronicle: normalizeChronicle(checkpoint.data.chronicle), stateHash: hashGameState(migrated), compatible: true, migrationError: null }; }); const anchor = BranchAnchorSchema.safeParse(legacy.branchAnchor); return createEnvelope(state, { chronicle, checkpoints, branchAnchor: anchor.success ? anchor.data : null }); }
function persistMigrated(envelope) { memoryEnvelope = envelope; if (hasTavernVariables())
    updateVariablesWith(vars => ({ ...vars, [variableKey]: envelope, [publicVariableKey]: createPublicProjection(envelope.state) }), { type: 'chat' }); }
function loadSave() { const raw = hasTavernVariables() ? getVariables({ type: 'chat' })?.[variableKey] : memoryEnvelope; const parsed = SaveEnvelopeSchema.safeParse(raw); if (parsed.success && validateEnvelope(parsed.data))
    return parsed.data; const migrated = migrateEnvelope(raw); if (migrated)
    persistMigrated(migrated); return migrated; }
function saveState(state, options = {}) { const current = loadSave(); const envelope = createEnvelope(state, { chronicle: options.chronicle ?? current?.chronicle ?? [], checkpoints: options.checkpoints ?? current?.checkpoints ?? [], branchAnchor: options.branchAnchor === undefined ? current?.branchAnchor ?? null : options.branchAnchor }); memoryEnvelope = envelope; if (hasTavernVariables())
    updateVariablesWith(vars => ({ ...vars, [variableKey]: envelope, [publicVariableKey]: createPublicProjection(state) }), { type: 'chat' }); return envelope; }
function historySnapshot(checkpoint) { if (!checkpoint.state)
    throw new Error('不兼容检查点不能写入楼层'); return HistorySnapshotSchema.parse({ saveId: checkpoint.state.saveId, checkpointId: checkpoint.id, revision: checkpoint.state.revision, state: checkpoint.state, chronicle: checkpoint.chronicle, stateHash: checkpoint.stateHash }); }
function latestAssistantMessageId() { if (typeof getChatMessages !== 'function')
    return null; return getChatMessages(-1, { role: 'assistant' })[0]?.message_id ?? null; }
async function addCheckpoint(state, chronicle, name, important = false) { const current = loadSave() ?? createEnvelope(state, { chronicle }); const checkpoint = CheckpointSchema.parse({ id: `checkpoint_${state.revision}_${Date.now().toString(36)}`, name: name.trim().slice(0, 40) || `修订 ${state.revision}`, createdAt: new Date().toISOString(), important, state: cloneState(state), chronicle: normalizeChronicle(chronicle), stateHash: hashGameState(state), compatible: true, migrationError: null }); let envelope = saveState(state, { chronicle, checkpoints: [...current.checkpoints, checkpoint].slice(-10) }); if (important && typeof createChatMessages === 'function') {
    await createChatMessages([{ role: 'assistant', message: `【CK 领主 RPG 检查点】${checkpoint.name}\n日期：${state.currentDate} · 修订：${state.revision}`, data: { ckLordRpg: { kind: 'manual', snapshot: historySnapshot(checkpoint) } } }], { refresh: 'none' });
    const messageId = latestAssistantMessageId();
    if (messageId !== null)
        envelope = saveState(state, { chronicle, checkpoints: envelope.checkpoints, branchAnchor: { messageId, kind: 'manual', checkpointId: checkpoint.id, revision: state.revision } });
} return envelope; }
function restoreCheckpoint(id) { const envelope = loadSave(); const checkpoint = envelope?.checkpoints.find(item => item.id === id); if (!checkpoint?.compatible || !checkpoint.state || checkpoint.stateHash !== hashGameState(checkpoint.state))
    return null; const state = cloneState(checkpoint.state), chronicle = normalizeChronicle(checkpoint.chronicle); saveState(state, { chronicle, checkpoints: envelope?.checkpoints, branchAnchor: null }); return { state, chronicle }; }
async function writeNarrativeExchange(state, chronicle, playerText, narration) { if (typeof createChatMessages !== 'function')
    return saveState(state, { chronicle }); const checkpoint = CheckpointSchema.parse({ id: `scene_${state.revision}_${Date.now().toString(36)}`, name: `正式场景 · ${state.currentDate}`, createdAt: new Date().toISOString(), important: false, state: cloneState(state), chronicle: normalizeChronicle(chronicle), stateHash: hashGameState(state), compatible: true, migrationError: null }); await createChatMessages([{ role: 'user', message: playerText, data: { ckLordRpg: { kind: 'scene_input', saveId: state.saveId, revision: state.revision } } }, { role: 'assistant', message: narration, data: { ckLordRpg: { kind: 'scene', snapshot: historySnapshot(checkpoint) } } }], { refresh: 'none' }); const messageId = latestAssistantMessageId(); return saveState(state, { chronicle, branchAnchor: messageId === null ? undefined : { messageId, kind: 'scene', checkpointId: checkpoint.id, revision: state.revision } }); }
function findLatestHistorySnapshot() { if (typeof getChatMessages !== 'function' || typeof getLastMessageId !== 'function')
    return null; const last = getLastMessageId(); if (last < 0)
    return null; const messages = getChatMessages(`0-${last}`, { role: 'assistant' }); for (let i = messages.length - 1; i >= 0; i--) {
    const raw = messages[i].data?.ckLordRpg;
    if (!raw || (raw.kind !== 'manual' && raw.kind !== 'scene'))
        continue;
    const parsed = HistorySnapshotSchema.safeParse(raw.snapshot);
    if (parsed.success && parsed.data.stateHash === hashGameState(parsed.data.state))
        return { messageId: messages[i].message_id, kind: raw.kind, snapshot: parsed.data };
} return null; }
function restoreLatestHistoryBranch() { const current = loadSave(), history = findLatestHistorySnapshot(); if (!current || !current.branchAnchor || !history || current.branchAnchor.messageId === history.messageId || history.snapshot.saveId !== current.state.saveId)
    return current; return saveState(cloneState(history.snapshot.state), { chronicle: history.snapshot.chronicle, checkpoints: current.checkpoints, branchAnchor: { messageId: history.messageId, kind: history.kind, checkpointId: history.snapshot.checkpointId, revision: history.snapshot.revision } }); }
function exportSave(state, chronicle = []) { return JSON.stringify(saveState(state, { chronicle }), null, 2); }
function importSave(source) { try {
    const raw = JSON.parse(source);
    const parsed = SaveEnvelopeSchema.safeParse(raw);
    const envelope = parsed.success ? parsed.data : migrateEnvelope(raw);
    if (!envelope || !validateEnvelope(envelope))
        return { ok: false, error: '存档结构、完整状态哈希或事件链校验失败。' };
    saveState(envelope.state, { chronicle: envelope.chronicle, checkpoints: envelope.checkpoints, branchAnchor: envelope.branchAnchor });
    return { ok: true, state: envelope.state, chronicle: envelope.chronicle };
}
catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
} }
function clearMemorySaveForTests() { memoryEnvelope = null; }

;// ./src/ck-runtime/index.ts


const macroPattern = /\{\{CK(?::([^}]+))?\}\}/gi;
function publicProjection() {
    return getVariables({ type: 'chat' }).ck_lord_rpg_public;
}
function readPath(root, path) {
    if (!path || path === '$ALLDATA')
        return root;
    return path.split('.').filter(Boolean).reduce((current, segment) => {
        if (current === null || typeof current !== 'object')
            return undefined;
        return current[segment];
    }, root);
}
function macroText(value) {
    if (value === undefined)
        return '';
    if (typeof value === 'string')
        return value;
    if (value === null || typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return JSON.stringify(value);
}
function syncPublicProjection() {
    const save = loadSave();
    if (!save)
        return;
    const projection = createPublicProjection(save.state);
    updateVariablesWith(variables => ({ ...variables, ck_lord_rpg_public: projection }), { type: 'chat' });
}
function init() {
    registerVariableSchema(object({
        ck_lord_rpg: SaveEnvelopeSchema.optional(),
        ck_lord_rpg_public: PublicProjectionSchema.optional(),
    }).passthrough(), { type: 'chat' });
    const macro = registerMacroLike(macroPattern, (_context, _fullMatch, path) => {
        return macroText(readPath(publicProjection(), path?.trim() || '$ALLDATA'));
    });
    const listeners = [];
    const notify = async (historyChanged) => {
        syncPublicProjection();
        await eventEmit('ck:host_state_changed', historyChanged);
    };
    listeners.push(eventOn(tavern_events.CHAT_CHANGED, () => notify(false)));
    for (const eventName of [tavern_events.MESSAGE_SWIPED, tavern_events.MESSAGE_DELETED, tavern_events.MESSAGE_EDITED, tavern_events.MESSAGE_UPDATED]) {
        listeners.push(eventOn(eventName, () => notify(true)));
    }
    syncPublicProjection();
    window.addEventListener('pagehide', () => {
        listeners.forEach(listener => listener.stop());
        macro.unregister();
    }, { once: true });
}
if (typeof $ === 'function')
    $(() => init());
else
    init();
