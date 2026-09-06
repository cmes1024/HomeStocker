import { getHosts, urls, envMaps, prefixs } from "./config";

class requestUrl {
  #envStr = ""; // 环境缩写
  #envKey = ""; // 环境缩写在列表中对应的key值
  #envMap = envMaps; // 环境列表
  #preFixs = prefixs; // 前缀列表 （设定或自定义）
  #Urls = urls; // API列表

  /**
   * 构造函数，初始化环境缩写
   * @param {String} envStr 环境缩写，默认为"prod"（生产环境）
   * @throws 如果环境缩写在环境列表中找不到，则抛出错误
   */
  constructor(envStr = "prod") {
    const envKey = this.#envMap.get(envStr);
    if (envKey === undefined) {
      throw new Error(`Environment key '${envStr}' not found in envMaps`);
    }
    this.#envStr = envStr;
    this.#envKey = envKey;
  };

  // 以下为获取类内部变量值的getter方法
  get getEnvStr() {
    return this.#envStr
  }

  get getEnvKey() {
    return this.#envKey;
  };

  get getEnvMaps() {
    return this.#envMap;
  };

  get getPreFixs() {
    return this.#preFixs
  };

  get getUrls() {
    return this.#Urls;
  };

  /**
 * 获取接口地址
 * @param {Object | String} options 入参对象, 为字符串类型时默认为apiName的值
 * @param {Boolean} options.hostType 域名类型， "apiHost" 或 "paymentHost" 或 "agreenmentHost", 为空则只返回接口，不带域名
 * @param {String} options.env 当返回数据要求带域名的时候，环境可自定义，默认为初始化环境
 * @param {String} options.apiName 接口名称, a.b.c的时候访问的结构是urls:{a:{b:{c: 'test'}}
 * @param {String|[String]} options.preFix 接口前缀, 为字串时优先查找配置后拼接，为数组时候会依次查找配置拼接，无配置则作为前缀拼接
 * @returns {String} 请求接口地址
 */
  getApiUrl(options) {
    if (typeof options == 'string') {
      options = { apiName: options }
    } else if (typeof options !== 'object' || options === null) {
      throw new TypeError("options must be a string or an object");
    }
    let { hostType = "apiHost", env, apiName, preFix } = options;
    let HOST = `${this.getHost({ env, hostType }) || ""}`;
    let PREFIX = "";
    if (typeof preFix == 'string') {
      PREFIX += `${this.getPreFixs.get(preFix) || preFix || ""}`;
    } else if (Array.isArray(preFix)) {
      PREFIX += preFix.reduce((acc, item) => acc + (this.getPreFixs.get(item) || item || ""), "")
    }
    let APINAME = `${apiName.split(".").reduce((pre, item) => pre[item] || "", this.getUrls)}`;
    return `${HOST}${PREFIX}${APINAME}`
  };

  /**
   * 获取域名数据
   * @param {String} options.env 指定环境，为空时默认为初始化环境 
   * @param {String} options.hostType 指定域名类型， 为空时以对象形式返回所有
   * @returns {String|Object} 返回指定类型域名或者所有域名
   */
  getHost(options = {}) {
    let { env, hostType } = options;
    if (!env) env = this.getEnvKey;
    else {
      env = this.getEnvMaps.get(env) || "";
    }
    return getHosts({ env, hostType });
  };
}
module.exports = requestUrl;