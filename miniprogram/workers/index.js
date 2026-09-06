// 版本库2.18.1开始支持
const functions = {
  fun1: param => {
    let list = new Array(500).fill(1);
    list.map(item => console.log(new Date().getTime()))
    return `来自worker线程fun1函数的处理： ${JSON.stringify(param)}`
  },
  fun2: param => {
    return `来自worker线程fun2函数的处理： ${JSON.stringify(param)}`
  }
}

/**
 * 监听worker
 */
worker.onMessage(({ key, fun, param }) => {
  let data = functions?.[fun]?.(param);
  worker.postMessage({ key, data });
})