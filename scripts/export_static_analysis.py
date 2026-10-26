"""공식 분석 응답을 CDN에서 제공할 JSON 묶음으로 미리 계산한다(비밀키·원본 파일 제외)."""
from __future__ import annotations
import argparse,json,sys,time,math
from pathlib import Path
from functools import lru_cache
from urllib.parse import urlencode


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
    from app.services import food_map,area_overview,area_character,area_report_extras,data_store,heatmap
    from app.routers.regions import list_regions,reb_zones
    # 내보내기 작업에서만 계산을 재사용하고 서비스 본체의 공유 데이터를 바꾸지 않는다.
    food_map._unit_table=lru_cache(maxsize=4)(food_map._unit_table)
    output=args.output;output.mkdir(parents=True,exist_ok=True)
    manifest={};chunk={};size=0;number=0;total=0
    def key(path,params=None):
        return path+('?' + urlencode(sorted((k,str(v)) for k,v in (params or {}).items() if v is not None)) if params else '')
    def flush():
        nonlocal chunk,size,number
        if not chunk:return
        name=f'part-{number:04d}.json'
        (output/name).write_text(json.dumps(chunk,ensure_ascii=False,separators=(',',':'),allow_nan=False))
        for k in chunk:manifest[k]=name
        chunk={};size=0;number+=1
    def clean(v):
        if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
        if isinstance(v,(list,tuple)):return [clean(x) for x in v]
        if isinstance(v,float) and not math.isfinite(v):return None
        return v
    def add(path,value,params=None):
        nonlocal size,total
        value=clean(value)
        k=key(path,params)
        payload=json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)
        if size+len(payload.encode())>8_000_000:flush()
        chunk[k]=value;size+=len(payload.encode());total+=1
    add('/api/regions',list_regions());add('/api/reb-zones',reb_zones())
    cats=food_map.categories();add('/api/food/categories',cats);add('/api/food/anchors',food_map.anchors())
    for metric in heatmap.METRICS:add('/api/food/heat',heatmap.heat(metric),{'metric':metric})
    scopes=[None]+[g['svc_cd'] for g in cats['groups']]
    started=time.time()
    for level in food_map.LEVELS:
      codes=food_map._units()[level]['code'].tolist()
      for svc in scopes:
        params={'svc':svc} if svc else {}
        for metric in food_map.METRICS:
          add('/api/food/bubbles',food_map.bubbles(level,svc,None,metric),{'level':level,'metric':metric,**params})
        for code in codes:
          add('/api/food/compare',food_map.compare(level,[code],svc,None),{'level':level,'codes':code,**params})
          root=f'/api/food/units/{level}/{code}'
          # 보고서와 초기 매장 목록에 쓰는 두 가지 크기만 저장, 페이지 이동은 서버가 처리한다.
          for limit in (8,50):add(root+'/stores',food_map.stores_in_unit(level,code,svc,None,limit),{'limit':limit,'offset':0,'sort':'distance',**params})
          if level!='gu':
            add(root+'/overview',area_overview.overview(level,code,svc,None),params)
            add(root+'/character',area_character.character(level,code,svc,None),params)
            add(root+'/report-extras',area_report_extras.extras(level,code,svc,None),params)
        flush()
        print(level,svc or 'all',total,'responses',round(time.time()-started,1),'s',flush=True)
    flush()
    (output/'manifest.json').write_text(json.dumps({'version':1,'routes':manifest},ensure_ascii=False,separators=(',',':')))
    print('complete',total,number,'files',flush=True)

if __name__=='__main__':main()
