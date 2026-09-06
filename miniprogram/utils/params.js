import { sha1 } from "./util";
class Baseparams {
  #userCenterVersion = "1.0.0";
  #userCenterAppId = '100007';
  #sourceWay = 2;
  #sourceSys = 1;
  #sourceSubSys = 0;
  #keys = new Map([
    ["prod", "j37hjdyy394"],
    ["stage", "3ed123"],
    ["test05", "3ed123"]
  ]);
  #key = "";
  #terminalParams = new Map([
    ["prod", {
      productType: "prod"
    }],
    ["stage", {
      productType: "stage"
    }],
    ["test05", {
      productType: "test05"
    }]
  ])
  #terminalInfo = {};
  #city = 145;
  #platform = 1;

  constructor(envStr = "prod") {
    this.#key = this.#keys.get(envStr);
    this.#terminalInfo = this.#terminalParams.get(envStr);
  }

  /**
   * 返回用户中心专有参数
   */
  get userCenterParams() {
    return {
      userCenterVersion: this.#userCenterVersion,
      userCenterAppId: this.#userCenterAppId,
      sourceWay: this.#sourceWay,
      sourceSys: this.#sourceSys,
      sourceSubSys: this.#sourceSubSys,
      key: this.#key
    }
  }

  /**
   * 返回通用基础参数
   */
  get commonParams() {
    return {
      city: this.#city,
      platform: this.#platform
    }
  }

  get terminalParam() {
    return this.#terminalInfo
  }

  /**
   * 用户中心参数加工
   * @description 用于用户中心为主的请求入参处理
   * @author cme
   * @since 0.0.1
   * @version 0.0.1
   * @param {Object} params 业务参数
   * @param {String} params.version 接口使用的版本号，默认为配置
   * @returns {object} 最终参数对象
   */
  userCenterApiParam(params = {}, version = this.#userCenterVersion) {
    let str = JSON.stringify(params);
    return {
      appId: this.#userCenterAppId,
      body: str,
      timestamp: parseInt(new Date().getTime() / 1000),
      sign: sha1(this.#key + str + this.#key).toUpperCase(),
      msgId: new Date().getTime() + '',
      version
    }
  }
}
module.exports = Baseparams