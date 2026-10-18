#!/usr/bin/env python3
"""在 Actions Summary 與 GitHub Issues 產生可追蹤的更新告警；失敗不阻擋部署。"""
from __future__ import annotations
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def main():
    outcome=sys.argv[1] if len(sys.argv)>1 else 'unknown'
    f=ROOT/'alerts.json'
    try: alerts=json.loads(f.read_text(encoding='utf8')).get('newAlerts',[]) if f.exists() else []
    except ValueError:alerts=[]
    if outcome!='success':alerts=[{'kind':'workflow-refresh-failed','reason':'資料更新失敗，舊資料保留；請檢查本次 Actions 執行紀錄'}]
    # 只有出現警訊時建立提醒，不寄送任何私人資料。
    if not alerts:
        print('無新增異常。')
        return 0
    lines=['## 肯德基優惠更新異常', '',f'執行狀態：{outcome}', '',
           '以下為自動解析警訊，非肯德基官方公告，請核對來源頁面：','']
    for alert in alerts[:18]:
        lines.append('- `'+str(alert.get('kind'))+'`：'+json.dumps(alert,ensure_ascii=False)[:650])
    lines.extend(['','來源：https://github.com/Winedays/KCouper 、https://info.talk.tw/kfc-coupon/',
                  '審查：請查閱 `pending-review.json`、`update-status.json` 與該次 Actions Log。'])
    body='\n'.join(lines)
    if summary:=os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(summary,'a',encoding='utf8') as out:out.write(body+'\n')
    print(body)
    if not os.environ.get('GITHUB_TOKEN') or not os.environ.get('GITHUB_REPOSITORY'):
        return 0
    title='[自動提醒] 肯德基優惠資料需人工核對'
    try:
        proc=subprocess.run(['gh','issue','list','--state','open','--search',f'"{title}" in:title',
                             '--json','number,title'],capture_output=True,text=True,check=True,timeout=25)
        issues=json.loads(proc.stdout)
        matched=[x for x in issues if x['title']==title]
        if matched:
            number=matched[0]['number']
            subprocess.run(['gh','issue','comment',str(number),'--body',body],check=True,timeout=25)
            print('已更新提醒 Issue #'+str(number))
        else:
            subprocess.run(['gh','issue','create','--title',title,'--body',body],check=True,timeout=25)
            print('已建立提醒 Issue')
    except Exception as exc:
        print('GitHub Issue 發送未成功（仍可從 Actions Summary 查看）：',exc,file=sys.stderr)
    return 0

if __name__=='__main__':sys.exit(main())
