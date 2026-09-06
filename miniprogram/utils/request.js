const debuggerEnv = new Map([
  ['stage', true],
  ['test', true]
])
class RequestManager {
  #requestStatus = null;
  #requestTask = new Set();
  #requstStatusMap = new Map([
    ['REQUESTLOADING', 1], // 灰度数据正在请求 
    ['HASREQUEST', 2], // 灰度数据已经请求到 
  ]);
  #requestWhiteList = []; // 请求接口白名单
  #requstTime = 20 * 1000; // 请求超时时间
  #requestCode = {
    successCodes: [0, 200, "0", "200"],
    failCodes: [500],
    unLoginCodes: [99]
  };

  // requestIdleCallback 的 polyfill，用于空闲时调度非紧急任务
  #idleCallback = (() => {
    if (typeof requestIdleCallback === 'function') {
      return (fn, options) => requestIdleCallback(fn, options)
    }
    // 降级：300ms 后用 setTimeout 兜底
    return (fn) => setTimeout(() => fn({ didTimeout: true }), 300)
  })()


  /**
   * 构造函数，初始化环境缩写
   * @param {String} envStr 环境缩写，默认为"prod"（生产环境）
   */
  constructor(envStr = "prod") {
    if (typeof debuggerEnv.get(envStr) == 'boolean') {
      wx?.setEnableDebug?.({
        enableDebug: debuggerEnv.get(envStr)
      })
    }
  }

  /**
   * 设置域名请求白名单
   * @param {*} list 
   */
  setWhiteList(list) {
    this.#requestWhiteList = list;
  }

  /** 
 * 业务接口请求前触发 
 * @description 控制业务数据的请求，白名单（requestWhiteList）中的接口优先
 * @author cme
 * @since 0.0.1
 * @version 0.0.1 
 * @param {Object} options 辅助参数 
 * @param {Boolean} options.startRequest 是否放开请求队列
 * @param  {Boolean} options.clear 是否清除请求队列
 * @param {String} options.url 请求的业务接口 
 * @param {Boolean} options.idle 是否在浏览器空闲时发起请求（非关键请求）
 * @param {Number} options.idleTimeout 空闲调度的超时时间，默认 3000ms
 * @param {Function} callback 回调函数 
 */
  async preTreatment(options = {}, callback) {
    if (typeof options === 'function' && !callback) callback = options;
    // 空闲调度：非关键请求在浏览器空闲时执行，避免阻塞用户交互
    if (options.idle && typeof callback === 'function') {
      this.#idleCallback(() => {
        callback();
      }, { timeout: options.idleTimeout || 3000 });
      return;
    }
    if (options.startRequest) {
      this.#requestStatus = this.#requstStatusMap.get("REQUESTLOADING");
      this.#requestTask.add(callback);
      this.#requestStatus = this.#requstStatusMap.get("HASREQUEST");
      this.#requestTask.forEach(resolve => {
        if (typeof resolve === 'function') {
          resolve();
        }
      })
      this.#requestTask.clear();
    } else if (options.clear) {
      this.#requestTask.clear();
    } else if (!this.#requestWhiteList.length || this.#requestStatus === this.#requstStatusMap.get("HASREQUEST") || this.#requestWhiteList.map(item => options?.url.indexOf(item) >= 0).includes(true)) {
      if (typeof callback === 'function') {
        callback();
      };
    } else if (this.#requestStatus === this.#requstStatusMap.get("REQUESTLOADING")) {
      typeof callback == 'function' && this.#requestTask.add(callback);
    } else {
      this.#requestTask.add(callback);
    }
  }

  /**
   * 请求快速版
   * @description 将接口配置和入参配置统一传入统一处理
   * @param {Object|String} urlOptions 接口配置
   * @param {Object} paramsOptions 参数配置
   * @param {Object} options 发起请求的辅助参数
   */
  requestTypesQuick(urlOptions, paramsOptions, options) {
    let { ucp, version, ...param } = paramsOptions;
    let url = wx._requestUrl.getApiUrl(urlOptions);
    let params = ucp ? wx._baseParams.userCenterApiParam(param, version) : param;
    return this.requestTypes(url, params, options);
  }

  /**
 * 发起请求
 * @description 发起网络请求
 * @author cme
 * @since 0.0.1
 * @version 0.0.1
 * @param {String} url 请求地址，不带host
 * @param {Object} data 请求入参
 * @param {Object} options 辅助参数
 * @param {String} options.type 请求类型 用于定义请求方式和header信息，默认GET类型
 * @param {Number} options.timeout 超时时间 默认20秒
 * @param {Object} options.headers 请求header
 * @param {Boolean} options.withCommonParam 是否携带接口请求的通用参数
 * @param {Boolean} options.ucp 是否使用用户中心接口参数加工方式
 * @param {Boolean} options.hideLoading 是否使用加载状态
 * @example requstTypes('/gw/app/v5/cart/count', {}, {type: 'login'})
 * @example requstTypes('/gw/app/v5/cart/count', {}, {type: 'login', host: 'https://m.dongfangfuli.com'})
 */
  requestTypes(url, data, options = {}) {
    return new Promise((resolve, reject) => {
      this.preTreatment({ url }, () => {
        let { type, timeout, headers = {}, withCommonParam, ucp, hideLoading } = options;
        if (withCommonParam) {
          data = Object.assign(this.addCommonParam({ url }), data);
        }
        if (ucp) { // 用户中心的接口需要处理 user_center_params
          data = wx._baseParams.userCenterApiParam(data);
        }
        let { method, ...commonHeader } = this.addHeader(type);
        let headerParams = {
          "cookie": this.dealCookie(),
          "Business-Type": 1,
          ...commonHeader,
          ...headers
        };
        let requestTask = this.basicRequest({
          url,
          data,
          method,
          timeout,
          header: headerParams,
          success: response => {
            if (this.checkSuccess(response)) {
              resolve(response.data || response);
            } else {
              reject(response.data || response);
            }
          },
          fail: err => {
            reject(err)
          },
          complete: info => {
            this.checkRes(info, options);
          }
        })
      })
    })
  }

  /**
   * 基础请求封装
   * @description 用于所有类型的请求的底层封装
   * @author cme
   * @since 0.0.1
   * @version 0.0.1
   * @param {Object} requestDatas 入参
   * @param {String} requestDatas.url 请求地址
   * @param {Function} requestDatas.success 请求成功回调函数
   * @param {Function} requestDatas.fail 请求失败回调函数
   * @returns {object} requstTask 本次请求任务
   * @returns {function} requestTask.abort 取消本次请求
   */
  basicRequest(requestDatas) {
    let { url, data, method, timeout, header, success, fail, complete } = requestDatas;
    const requestTask = wx.request({
      url,
      data,
      timeout: timeout || this.#requstTime,
      header,
      method,
      success,
      fail,
      complete
    })
    return requestTask;
  }

  /**
   * 保存当前cookies数据到缓存
   * @description 保存当前cookies数据到缓存
   * @author cme
   * @since 0.0.1
   * @version 0.0.1
   * @param {Object} cookies 接口返回的cookie数据
   */
  saveCookies(cookies) { }

  /**
   * 请求中添加cookie到header中
   * @description 请求中添加cookie到header中
   * @author cme
   * @since 0.0.1
   * @version 0.0.1
   * @returns {String} cookies 返回cookie字符串
   */
  dealCookie() {
    var res = '';
    return res;
  }

  /**
   * 整合并添加header数据
   * @description 含有统一商城灰度判断，并添加相关专有header
   * @author cme
   * @since 0.0.1
   * @version 0.0.1
   * @param {String} type 请求类型 
   * @returns {object} header
   * @example addHeader('get')
   * @example addHeader('postbasic')
   */
  addHeader(type = '') {
    const ut = wx.getStorageSync('ut')
    let param = {
      "cookie": this.dealCookie(),
      "ut": ut ? JSON.parse(ut) : '',
      "Business-Type": 1,
      "terminal": "mini"
    }
    switch (type.toLowerCase()) {
      case 'postbasic':
      case 'payment':
        param["content-type"] = "application/json;charset=UTF-8"
        param["Accept"] = "application/json, text/plain, */*"
        param['method'] = 'POST'
        break;
      case 'postform':
        param["content-type"] = "application/x-www-form-urlencoded;text/html;"
        param['method'] = 'POST'
        break;
      case 'login':
        param["content-type"] = "application/json;charset=UTF-8"
        param['method'] = 'POST'
        break;
      default:
        param['method'] = 'GET'
    }
    return param;
  }

  /**
   * 添加基础参数
   * @description 接口请求通用的入参
   * @author cme
   * @since 0.0.1
   * @version 0.0.1
   * @param {Object} options 辅助参数
   * @returns {object} 参数合集
   */
  addCommonParam(options) {
    return wx._baseParams.commonParams;
  }

  /**
   * 统一处理接口返回数据
   * @description 根据请求返回数据，处理基础信息的整合和存储
   * @author cme
   * @since 0.0.1
   * @version 0.0.1
   * @param {Object} response 接口返回数据
   * @param {Object} options 请求参数信息
   */
  checkRes(response, options = {}) {
    let { unLoginCodes } = this.#requestCode;
    if (unLoginCodes.includes(response?.data?.errorCode)) {
      // 去登录
    }
  }

  /**
   * 判断请求是否成功
   * @param {*} response 请求的返回体
   */
  checkSuccess(response) {
    let { statusCode, data } = response;
    let { successCodes, failCodes, unLoginCodes } = this.#requestCode;
    let code = data?.errorCode == null ? (statusCode == null ? "" : statusCode) : data?.errorCode;
    return successCodes.includes(code) && data?.success;
  }
}
module.exports = RequestManager;