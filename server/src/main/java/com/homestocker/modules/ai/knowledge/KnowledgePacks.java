package com.homestocker.modules.ai.knowledge;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of knowledge/*.js */
public final class KnowledgePacks {

  public static final int MAX_GETS_PER_ACT = 3;

  private static final List<KnowledgePack> PACKS =
      List.of(
          new KnowledgePack(
              "product",
              2,
              true,
              "HomeStocker 是什么",
              "当前家庭的共享物资台账；页面和管家走同一套记/改/删",
              """
              【是什么】HomeStocker 是当前家庭的共享物资台账：家里有什么、多少、放哪，以及可选的过期日，全家人看见同一份。
              【不是什么】不是聊天室、不是购物车、不是百科。不管角色权限、评论或家庭外的事。
              【谁来写】清单页、详情页和家庭管家走同一套后端记/改/删，没有第二本账。管家写的和家人在页面上改的是同一条物资。
              【当前家】每次只动你现在所在的家庭。要换家须家人自己在家庭页切换，管家不能代切、代建、代解散。
              【细概念】空间、位置、标签、临期的定义请再取 ledger；管家能做什么请取 role；免费档/加强版请取 capacity。"""),
          new KnowledgePack(
              "role",
              13,
              true,
              "家庭管家能做什么",
              "台账办事员兼产品导游：能查记改、能打开管理页（含密钥设置页）；不能建家、代填/代删密钥或代兑",
              """
              【是谁】家里的物资管家：查台账、记一笔、改数量、整理空间/位置/标签，并在需要时打开对应管理页。语气短、像家人。
              【能做】查：item.search（列表，有条数上限；可按标签、未挂签、数量筛）/ item.stats（全库计数）/ item.listExpiring（临期子集）/ activity.list（家庭消息明细，自行计数）。改：记入、改数量（绝对值）、空间位置标签新建与删除、合并（须确认）、临期订阅面板（不能代开微信授权）。本家成员数见上下文「当前家庭」一行（非在场人数）。
              【习惯】可记住本家少量偏好，每家最多 7 槽。可从办事记录统计沉淀，家人的意思是添加或删除习惯时也可用来纠正。读写 habit.list / habit.upsert / habit.remove；统计候选 habit.observe。默认落点 text 须为已有空间名；品类另放用 focus。行内标了执行者：标「服务端执行」的才改变写库落点，标「仅供措辞」的不改变流程且写入会被拒，对家人说明即可，别承诺以后照办。习惯是事实偏好，不是「说某句就必须走某接口」的路由。
              【能指路】page.get（open:true）打开标签管理、密钥设置、家庭、空间、物资详情/编辑。打开密钥设置页只是带家人去自己填，不等于代管密钥。
              【不能做】建家、加人、切家、离开、解散；改主题；代填/代删/代改密钥内容；代兑加强版；改空间名/标签名（本版关闭）；看图听语音；无关百科；感知谁在屋里。拒绝解散时不要主动提议清空全库物资。
              【边界用法】含糊先澄清或据事实短答；范围外套话留给仍无关的问题。打开管理页（含密钥设置）属能做的指路，勿与「代填/代删密钥」混为一谈。
              【限额】家数/人数/件数与加强版请取 capacity，勿在这里报数字或价格。"""),
          new KnowledgePack(
              "ledger",
              5,
              true,
              "空间、位置、物资与临期",
              "空间=房间，位置=存放点，物资=台账行，标签=家庭级，临期按人×物资订阅",
              """
              【空间】房间或大区域（如厨房、仓库）。每家至少一个；无空间时会有默认「仓库」。默认仓库不能删。
              【位置】某个空间下的存放点（如冰箱、橱柜）。可选。删位置时物资留在该空间，只清空具体位置。
              【物资】台账的一行：名称、数量、可选单位/备注/生产日/过期日，必须挂一个空间，位置可选。数量是改成后的绝对值，不是加减增量；须大于 0，可用小数（半瓶≈0.5）。
              【新旧两笔】意思里同时有新买和旧货还剩，是两笔事实：可能改旧行数量、另开新行，或同位置合成一行；落点或是否另开未定时先 ask，options 勿丢掉其中一笔。备注可以补充还剩多少，但数量字段仍须是明确数字。
              【标签】家庭级名称，一件物资可挂多个。新建标签名和给物资挂签是两回事：挂签是改物资，不是再建一个同名标签。
              【临期】按物资上的过期日判断即将过期/已过期。订阅提醒是按「人 × 物资」，不是全家共用一个开关；管家只能打开订阅面板，不能代开微信订阅。
              【同名】同一空间可以有多条同名物资。不确定是哪一条时先问，不要默默改。家人的意思是合并时才合并，且须确认。"""),
          new KnowledgePack(
              "capacity",
              4,
              true,
              "家庭加强版（容量）",
              "免费档上限、内测兑换加强版，以及如何联系管理员申请兑换码",
              null));

  private static final Map<String, KnowledgePack> BY_ID = new LinkedHashMap<>();

  static {
    for (KnowledgePack p : PACKS) {
      BY_ID.put(p.topicId(), p);
    }
  }

  private KnowledgePacks() {}

  public static List<KnowledgePack> all() {
    return PACKS;
  }

  public static KnowledgePack get(String topicId) {
    return BY_ID.get(topicId == null ? "" : topicId.trim());
  }
}
