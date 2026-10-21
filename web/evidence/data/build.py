"""Extract official 2025 workbooks; reconcile every direction/hour with published totals."""
from pathlib import Path
import zipfile,xml.etree.ElementTree as E,re,json,datetime,hashlib
BASE=Path(__file__).parent
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
URL='https://online.bote.gov.taipei/botedata/%E4%BA%A4%E9%80%9A%E6%B5%81%E9%87%8F/114%E5%B9%B4%E5%BA%A6/'
def sheet(z,n):
 strings=[''.join(t.itertext()) for t in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
 out={}
 for c in E.fromstring(z.read(f'xl/worksheets/sheet{n}.xml')).findall('.//s:c',NS):
  v=c.find('s:v',NS)
  if v is not None:out[c.attrib['r']]=strings[int(v.text)] if c.attrib.get('t')=='s' else v.text
 return out
COLS={'large':'D I M Q U X AA AD AG AJ AM AP'.split(),'small':'F K O R V Y AB AE AH AK AN AQ'.split(),'moto':'G L P S W Z AC AF AI AL AO AR'.split()}
stations=[];checks=0
for id in ['NI001','NI008','SI020','SI021','SI023','SI024']:
 p=BASE/'raw'/f'{id}.xlsx';z=zipfile.ZipFile(p);b=sheet(z,1);raw=sheet(z,2);summary=sheet(z,3)
 date=(datetime.datetime(1899,12,30)+datetime.timedelta(days=float(b['B6']))).date().isoformat()
 station={'id':id,'name':b['B2'].replace('~',' × '),'date':date,'weather':b['B7'],'source':URL+'XLS/'+id+'.xlsx','pdf':URL+'PDF/'+id+'.pdf','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'arms':{'A':b.get('K5'),'B':b.get('I10'),'C':b.get('G5'),'D':b.get('I2')},'series':[],'directions':{}}
 # Blank movement cells are omitted counts within this published workbook, not absent time bins.
 # This convention is accepted only when full-hour sums reconcile against all official totals.
 for di,direction in enumerate('ABCD'):
  records=[]
  for offset in range(16):
   r=5+di*16+offset;t=raw[f'B{r}'];counts={k:sum(float(raw.get(f'{c}{r}',0)) for c in cols) for k,cols in COLS.items()}
   assert all(v>=0 and v.is_integer() for v in counts.values())
   counts={k:int(v) for k,v in counts.items()};records.append({'time':t,**counts,'total':sum(counts.values())})
  # Two-stage left-turn counts H/T are not added: official vehicle totals exclude these duplicate-stage counts.
  for hour in range(4):
   sr=10+di*5+hour
   for k,c in [('large','W'),('small','Y'),('moto','AA')]:
    observed=sum(r[k] for r in records[hour*4:hour*4+4]);expected=int(float(summary.get(f'{c}{sr}',0)))
    assert observed==expected,(id,direction,hour,k,observed,expected)
    checks+=1
  station['directions'][direction]=records[:8]
 for i in range(8):
  row={'time':station['directions']['A'][i]['time']}
  for k in ['large','small','moto','total']:row[k]=sum(station['directions'][d][i][k] for d in 'ABCD')
  station['series'].append(row)
 station['series'] += [{'time':'09:00','large':None,'small':None,'moto':None,'total':None},{'time':'09:15','large':None,'small':None,'moto':None,'total':None}]
 stations.append(station)
data={'title':'內湖晨峰路口觀測','surveyYear':2025,'unit':'vehicle-passes/15min','dates':sorted(set(s['date'] for s in stations)),'stations':stations,'reconciliationChecks':checks,'notes':['各路口存在的進口方向加總；不是進入內湖的總車次，不可跨路口加總。','來源僅提供07:00–09:00晨峰調查，09:00–09:30缺測，未補零。','6個路口分兩個調查日，不是同日全網監控。','統計一般、左右慢車道及調撥車道三類機動車；另列匝道與自行車不納入此口徑，機車二段不再次加計；逐方向逐小時對帳已通過。']}
(BASE/'observations.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
(BASE.parent/'data.js').write_text('window.NEIHU_DATA = '+json.dumps(data,ensure_ascii=False)+';\n')
print('PASS',checks,'official hour/direction/class totals reconciled')
for s in stations:
 a=sum(r['total'] for r in s['series'][:4]);b=sum(r['total'] for r in s['series'][4:8]);peak=max(s['series'][:8],key=lambda r:r['total'])
 print(s['id'],s['date'],s['name'],'7h',a,'8h',b,'growth',round((b/a-1)*100,1),'peak',peak['time'],peak['total'],'moto%',round(sum(r['moto'] for r in s['series'][:8])/(a+b)*100,1))

# UTF-8 BOM allows direct opening in spreadsheet applications.
import csv
with (BASE/'observations.csv').open('w',encoding='utf-8-sig',newline='') as f:
 writer=csv.writer(f,lineterminator="\n");writer.writerow(['station_id','station_name','survey_date','start_Asia_Taipei','small_vehicle_passes','motorcycle_passes','large_vehicle_passes','total_vehicle_passes','status'])
 for s in stations:
  for r in s['series']:writer.writerow([s['id'],s['name'],s['date'],r['time'],r['small'],r['moto'],r['large'],r['total'],'not_surveyed' if r['total'] is None else 'observed'])
