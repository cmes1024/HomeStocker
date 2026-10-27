# Eval run: 20261024T125637Z-daily-use

- plan: daily-use
- title: 平常我会怎么用
- mode: act
- at: 2026-10-24T12:56:37.003Z

## Score

| status | n |
| --- | --- |
| pass | 34 |
| fail | 1 |
| pending | 0 |
| manual | 0 |
| skipped | 0 |
| error | 0 |

## Cases

- **user-shop-milk**: pass
  - 预期：家里账上多了/加上冰箱里的牛奶两盒，跟人说清楚记哪儿了
- **user-shop-chips**: pass
  - 预期：薯片记到零食柜，数量对得上
- **user-shop-detergent**: pass
  - 预期：听出「新的一瓶 + 旧的还剩半瓶」两件事；说不清落点/是否另开时要先问，不能假装记完了
- **user-shop-water-no-place**: pass
  - 预期：没说放哪就先问一句放哪/记到哪，不能瞎记到一个房间（用少见品名，避免并进旧账）
- **user-shop-salt-add**: pass
  - 预期：盐加量或新记两袋；落点不清就问；说人话回执
- **user-cook-eggs**: pass
  - 预期：先看家里账再答有没有、大概几个；不能瞎编
- **user-cook-soy**: pass
  - 预期：据实说有没有、大概在哪
- **user-cook-wrap-where**: pass
  - 预期：说出大概位置（比如厨房橱柜）
- **user-cook-tissue-low**: pass
  - 预期：看过数量再说多不多，别随口附和「嗯不多了」
- **user-cook-scallion-optional**: pass
  - 预期：查一下葱；没有就短说没有，别硬推销去记一笔
- **user-cook-rice-rough**: pass
  - 预期：有就说大概多少，没有就说没有；夹具里可能没有大米——如实说
- **user-expire-soon**: pass
  - 预期：列快过期的东西，别把全屋库存当临期念一遍
- **user-expire-yogurt**: pass
  - 预期：结合过期日说能不能喝/快不行了
- **user-expire-fridge-bad**: pass
  - 预期：看看冰箱相关临期/过期，据实说
- **user-expire-three-days**: pass
  - 预期：按临期窗口回答，人话列出名称
- **user-expire-fridge-deal**: pass
  - 预期：先列出快过期的再问怎么处理（删/用掉），不能一声不吭全删
- **user-use-milk-drank**: fail
  - 预期：牛奶不止一处时先问是哪边的；问清后再减一盒，并说清还剩多少
  - FAIL mustAsk: no ask signal
- **user-use-eggs**: pass
  - 预期：鸡蛋数量减2，跟人说还剩几个；不要新开一条鸡蛋
- **user-use-set-left**: pass
  - 预期：把刚才说的鸡蛋改成 2 个
- **user-use-soy-gone**: pass
  - 预期：要删酱油时先让人点头确认，确认前账上不能已经没了
- **user-use-chips-gone**: pass
  - 预期：去掉薯片这条，要确认；别留 0 袋在账上
- **user-use-toilet-gone**: pass
  - 预期：厕纸从家里账上拿掉（确认后），别留 0 卷
- **user-use-almost-gone**: pass
  - 预期：「差不多没了」不是精确数，先问改成多少/是否删掉，不能擅自清零
- **user-list-kitchen**: pass
  - 预期：把厨房里有的东西列出来给人看
- **user-list-snacks**: pass
  - 预期：列出零食相关的东西
- **user-list-baby**: pass
  - 预期：列出宝宝房/宝宝相关物资
- **user-list-medicine**: pass
  - 预期：列出西药相关还剩什么
- **user-family-who-milk**: pass
  - 预期：去家庭消息里找；找不到就老实说不知道，别编人名
- **user-family-recent**: pass
  - 预期：按最近进出/新记的东西说几样
- **user-family-salt-check**: pass
  - 预期：看看盐现在多少、最近有没有改过，据实说
- **user-shop-need-what**: pass
  - 预期：「缺啥」很宽：可先问指哪类，或结合临期/少货提示；别空口列购物清单装全知
- **user-shop-need-salt-bags**: pass
  - 预期：分别查盐、垃圾袋有没有；没有的说没有
- **user-undo-revoke**: pass
  - 预期：鸡蛋改回刚才加之前的数量，不是把鸡蛋整条删掉
- **user-undo-said-wrong**: pass
  - 预期：接住「说错了」：问要改回什么/撤销哪步，或按回执改回；别继续乱改别的
- **user-undo-dont-reduce-milk**: pass
  - 预期：不要减牛奶；账上牛奶数量保持原样
