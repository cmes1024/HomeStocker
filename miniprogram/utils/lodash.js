const typeCheckFunctions = {
  // 检查 value 是否为 null 或 undefined
  isNil: function (value) {
    return value == null;
  },
  // 检查 value 是否为 undefined
  isUndefined: function (value) {
    return value === undefined;
  },
  // 检查 value 是否为 null
  isNull: function (value) {
    return value === null;
  },
  // 检查 value 是否为函数
  isFunction: function (value) {
    return typeof value === 'function';
  },
  // 检查 value 是否为对象，不包括 null
  isObject: function (value) {
    const type = typeof value;
    return value != null && type === 'object';
  },
  // 检查 value 是否为数组
  isArray: function (value) {
    return Array.isArray(value);
  },
  // 检查 value 是否为布尔值
  isBoolean: function (value) {
    return value === true || value === false || Object.prototype.toString.call(value) === '[object Boolean]';
  },
  // 检查 value 是否为数字
  isNumber: function (value) {
    return typeof value === 'number' && isFinite(value);
  },
  // 检查 value 是否为字符串
  isString: function (value) {
    return typeof value === 'string' || Object.prototype.toString.call(value) === '[object String]';
  },
  // 检查 value 是否为正则表达式
  isRegExp: function (value) {
    return Object.prototype.toString.call(value) === '[object RegExp]';
  },
  // 检查 value 是否为 NaN
  isNaN: function (value) {
    return typeof value === 'number' && isNaN(value);
  },
  // 检查 value 是否为有限数字
  isFinite: function (value) {
    return typeof value === 'number' && isFinite(value);
  },
  // 检查 value 是否为整数
  isInteger: function (value) {
    return Number.isInteger(value);
  },
  // 检查 value 是否为安全的整数（在 JavaScript 中可以精确表示的整数范围）
  isSafeInteger: function (value) {
    return Number.isSafeInteger(value);
  },
  // 检查 value 是否为 Symbol
  isSymbol: function (value) {
    return typeof value === 'symbol';
  },
  // 检查 value 是否为 Map 对象
  isMap: function (value) {
    return value instanceof Map;
  },
  // 检查 value 是否为 Set 对象
  isSet: function (value) {
    return value instanceof Set;
  },
  // 检查 value 是否为 WeakMap 对象
  isWeakMap: function (value) {
    return value instanceof WeakMap;
  },
  // 检查 value 是否为 WeakSet 对象
  isWeakSet: function (value) {
    return value instanceof WeakSet;
  },
  // 检查 value 是否为 ArrayBuffer 对象
  isArrayBuffer: function (value) {
    return value instanceof ArrayBuffer;
  },
  // 检查 value 是否为 Date 对象
  isDate: function (value) {
    return value instanceof Date;
  },
  // 检查 value 是否为 Promise 对象
  isPromise: function (value) {
    return value instanceof Promise;
  },
  // 检查 value 是否为 TypedArray 对象（例如 Float32Array, Int8Array 等）
  isTypedArray: function (value) {
    return value instanceof Float32Array ||
      value instanceof Float64Array ||
      value instanceof Int8Array ||
      value instanceof Int16Array ||
      value instanceof Int32Array ||
      value instanceof Uint8Array ||
      value instanceof Uint8ClampedArray ||
      value instanceof Uint16Array ||
      value instanceof Uint32Array;
  }
};

module.exports = typeCheckFunctions;