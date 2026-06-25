import{o as e}from"./rolldown-runtime-CMxvf4Kt.js";import{b as t,v as n}from"./vendor-bootstrap-BfK0Jry-.js";import{N as r,R as i,V as a,z as o}from"./vendor-react-core-DkaoCP_C.js";import{a as s,c,d as l,f as u,g as ee,h as d,i as te,l as ne,m as re,o as f,p,s as ie}from"./index-CgiCiV1q.js";var m=e(t(),1),h=n(),g={"-24":.054,"-23":.068,"-22":.082,"-21":.096,"-20":.11,"-19":.124,"-18":.138,"-17":.152,"-16":.166,"-15":.18,"-14":.194,"-13":.208,"-12":.222,"-11":.236,"-10":.25,"-9":.264,"-8":.278,"-7":.292,"-6":.306,"-5":.32,"-4":.336,"-3":.352,"-2":.368,"-1":.384,0:.4,1:.42,2:.44,3:.46,4:.48,5:.5,6:.526,7:.552,8:.578,9:.604,10:.63,11:.666,12:.702,13:.738,14:.774,15:.81,16:.848,17:.886,18:.924,19:.962,20:1,21:1.05,22:1.1,23:1.15,24:1.2,25:1.25,26:1.316,27:1.382,28:1.448,29:1.514,30:1.58,31:1.664,32:1.748,33:1.832,34:1.872,35:2,36:2.1,37:2.2,38:2.3,39:2.4,40:2.5,41:2.628,42:2.756,43:2.884,44:3.012,45:3.15,46:3.316,47:3.482,48:3.648,49:3.814,50:3.98,51:4.184,52:4.388,53:4.592,54:4.796,55:5,56:5.26,57:5.52,58:5.78,59:6.04,60:6.3,61:6.62,62:6.94,63:7.26,64:7.58,65:7.9,66:8.32,67:8.74,68:9.16,69:9.58,70:10,71:10.52,72:11.04,73:11.56,74:12.08,75:12.6,76:13.24,77:13.88,78:14.52,79:15.16,80:15.8,81:16.64,82:17.48,83:18.32,84:19.16,85:20,86:21.04,87:22.08,88:23.12,89:24.16,90:25.2,91:26.45,92:27.7,93:28.95,94:30.2,95:31.6,96:33.28,97:34.96,98:36.64,99:38.32,100:40,101:42.08,102:44.16,103:46.24,104:48.32,105:50.4,106:52.96,107:55.52,108:58.08,109:60.64,110:63.2},_=e=>{let t=Math.round(e).toString();return g[t]===void 0?1:g[t]},ae=[`Select One`,`Satisfactory`,`Unsatisfactory`,`Cleaned`,`See Comments`,`Not Applicable`],v=[`kΩ`,`MΩ`,`GΩ`],oe=[`250V`,`500V`,`1000V`,`2500V`,`5000V`],y=[`PASS`,`FAIL`,`N/A`],b={h1h2:`H1-H2`,h2h3:`H2-H3`,h3h1:`H3-H1`},x=[{netaSection:`7.2.1.1.A.1`,description:`Inspect physical and mechanical condition.`,result:``},{netaSection:`7.2.1.1.A.2`,description:`Inspect anchorage, alignment, and grounding.`,result:``},{netaSection:`7.2.1.1.A.3`,description:`*Prior to cleaning the unit, perform as-found tests.`,result:``},{netaSection:`7.2.1.1.A.4`,description:`Clean the unit.`,result:``},{netaSection:`7.2.1.1.A.5`,description:`Inspect bolted electrical connections for high resistance using a low-resistance ohmmeter`,result:``},{netaSection:`7.2.1.1.A.6.1`,description:`Perform as-left tests.`,result:``},{netaSection:`7.2.1.1.A.7`,description:`Verify that as-left tap connections are as specified.`,result:``}],S=[{winding:`Primary to Ground`,testVoltage:`1000V`,measured0_5Min:``,measured1Min:``,units:`GΩ`,corrected0_5Min:``,corrected1Min:``,correctedUnits:`GΩ`,tableMinimum:`100.5`,tableMinimumUnits:`GΩ`,dielectricAbsorption:``},{winding:`Secondary to Ground`,testVoltage:`500V`,measured0_5Min:``,measured1Min:``,units:`GΩ`,corrected0_5Min:``,corrected1Min:``,correctedUnits:`GΩ`,tableMinimum:``,tableMinimumUnits:`GΩ`,dielectricAbsorption:``},{winding:`Primary to Secondary`,testVoltage:`1000V`,measured0_5Min:``,measured1Min:``,units:`GΩ`,corrected0_5Min:``,corrected1Min:``,correctedUnits:`GΩ`,tableMinimum:``,tableMinimumUnits:`GΩ`,dielectricAbsorption:``}],C=()=>{let{id:e,reportId:t}=a(),[n,g]=(0,m.useState)(t),C=o(),se=i(),[ce]=r(),{user:w}=d(),{maskCustomerName:T,maskCustomerAddress:le}=re(),[E,D]=(0,m.useState)(!0),[O,k]=(0,m.useState)(!t),[A,j]=(0,m.useState)(!1),[ue,M]=(0,m.useState)(!1),[de,N]=(0,m.useState)(!1),P=m.useRef(null),F=m.useRef(!1),I=m.useRef(t),L=m.useRef(!1),R=m.useRef(!1),fe=m.useCallback(async()=>{if(I.current)return I.current;if(L.current){for(let e=0;e<100;e+=1)if(await new Promise(e=>setTimeout(e,100)),I.current)return I.current}},[]),z=ce.get(`print`)===`true`;se.pathname;let B=`two-small-dry-typer-xfmr-mts-report`,V=u(B),[H,U]=(0,m.useState)(null),W=(0,m.useRef)(!1),[G,K]=(0,m.useState)({customer:``,address:``,user:``,date:new Date().toISOString().split(`T`)[0],identifier:``,jobNumber:``,technicians:``,temperature:{fahrenheit:68,celsius:20,tcf:1,humidity:50,correctionFactor:1},substation:``,eqptLocation:``,nameplate:{manufacturer:``,kvaBase:``,kvaCooling:``,voltsPrimary:``,voltsPrimarySecondary:``,voltsSecondary:``,voltsSecondarySecondary:``,connectionsPrimary:`Delta`,connectionsSecondary:`Wye`,windingMaterialPrimary:`Aluminum`,windingMaterialSecondary:`Copper`,catalogNumber:``,tempRise:``,serialNumber:``,impedance:``,tapVoltages:Array(7).fill(``),tapPosition:`1`,tapPositionLeftVolts:``,tapPositionLeftPercent:``},indicatorGauges:{liquidLevel:``,temperature:``,pressureVacuum:``},visualInspectionItems:JSON.parse(JSON.stringify(x)),visualInspectionComments:``,insulationResistance:{tests:JSON.parse(JSON.stringify(S)),dielectricAbsorptionAcceptable:`Yes`},turnsRatio:{secondaryWindingVoltage:``,tests:[,].fill(null).map(()=>({tap:`3`,nameplateVoltage:``,calculatedRatio:``,measuredH1H2:``,devH1H2:``,passFailH1H2:``,measuredH2H3:``,devH2H3:``,passFailH2H3:``,measuredH3H1:``,devH3H1:``,passFailH3H1:``}))},testEquipment:{megohmmeter:{name:``,serialNumber:``,ampId:``,calDate:``},ttrTestSet:{name:``,serialNumber:``,ampId:``,calDate:``}},comments:``,status:`PASS`}),q=(0,m.useCallback)(async()=>{if(e){D(!0);try{let{data:t,error:n}=await p.schema(`neta_ops`).from(`jobs`).select(`title, job_number, customer_id, site_address`).eq(`id`,e).single();if(n)throw n;let r=``,i=t.site_address||``;if(t?.customer_id){let{data:e,error:n}=await p.schema(`common`).from(`customers`).select(`name, company_name, address`).eq(`id`,t.customer_id).single();if(n)throw n;r=e?.company_name||e?.name||``,i=t.site_address||e?.address||i||``}K(e=>({...e,jobNumber:t?.job_number||``,customer:T(r),address:i,user:e.user||``}))}catch(e){console.error(`Error loading job info:`,e),U(`Failed to load job information: ${e.message}`)}finally{D(!1)}}},[e,w]),J=async()=>{if(F.current){F.current=!1,D(!1);return}if(!n){D(!1),k(!0);return}try{let{data:e,error:t}=await p.schema(`neta_ops`).from(`two_small_dry_type_xfmr_mts_reports`).select(`*`).eq(`id`,n).single();if(t)throw t;e&&e.report_data&&(console.log(`Loading report data:`,e.report_data),console.log(`Loading testEquipment:`,e.report_data.testEquipment),K(t=>({...t,...e.report_data,nameplate:{...t.nameplate,...e.report_data.nameplate||{}},temperature:{...t.temperature,...e.report_data.temperature||{}},indicatorGauges:{...t.indicatorGauges,...e.report_data.indicatorGauges||{}},insulationResistance:{tests:e.report_data.insulationResistance?.tests||JSON.parse(JSON.stringify(S)),dielectricAbsorptionAcceptable:e.report_data.insulationResistance?.dielectricAbsorptionAcceptable||`Yes`},turnsRatio:{secondaryWindingVoltage:e.report_data.turnsRatio?.secondaryWindingVoltage||``,tests:e.report_data.turnsRatio?.tests||[,].fill(null).map(()=>({tap:`3`,nameplateVoltage:``,calculatedRatio:``,measuredH1H2:``,devH1H2:``,passFailH1H2:``,measuredH2H3:``,devH2H3:``,passFailH2H3:``,measuredH3H1:``,devH3H1:``,passFailH3H1:``}))},testEquipment:{...t.testEquipment,...e.report_data.testEquipment||{}},visualInspectionItems:e.report_data.visualInspectionItems||JSON.parse(JSON.stringify(x)),status:e.report_data.status||`PASS`})),k(!1))}catch(e){console.error(`Error loading report:`,e),U(`Failed to load report: ${e.message}`)}finally{D(!1)}};(0,m.useEffect)(()=>{n||q(),J()},[q,n]),(0,m.useEffect)(()=>{if(!(!O||W.current)){if(W.current=!0,G.temperature.fahrenheit){let e=(G.temperature.fahrenheit-32)*5/9,t=_(e);K(n=>({...n,temperature:{...n.temperature,celsius:parseFloat(e.toFixed(2)),tcf:t,correctionFactor:t}}))}setTimeout(()=>{W.current=!1},0)}},[G.temperature.fahrenheit,O]);let Y=(e,t)=>{if(!e)return``;let n=parseFloat(String(e).trim());return isNaN(n)?String(e).trim():(n*t).toFixed(2)};(0,m.useEffect)(()=>{let e=_(G.temperature.celsius),t=G.insulationResistance.tests.map(t=>{let n=Y(t.measured0_5Min,e),r=Y(t.measured1Min,e),i=``;if(t.measured1Min&&t.measured0_5Min){let e=parseFloat(String(t.measured1Min))/parseFloat(String(t.measured0_5Min));!isNaN(e)&&isFinite(e)&&(i=e.toFixed(2))}return{...t,corrected0_5Min:n,corrected1Min:r,dielectricAbsorption:i}}),n=G.insulationResistance.tests;if(JSON.stringify(t)===JSON.stringify(n))return;let r=t.map(e=>parseFloat(e.dielectricAbsorption)).every(e=>!isNaN(e)&&e>1)?`Yes`:`No`;K(e=>({...e,insulationResistance:{...e.insulationResistance,tests:t,dielectricAbsorptionAcceptable:r}}))},[G.insulationResistance.tests,G.temperature.celsius]),(0,m.useEffect)(()=>{O&&K(e=>{let t=e.turnsRatio.tests.map(t=>{let n=parseInt(t.tap)-1;if(n>=0&&n<e.nameplate.tapVoltages.length){let r=e.nameplate.tapVoltages[n];if(r)return{...t,nameplateVoltage:r}}return t});return{...e,turnsRatio:{...e.turnsRatio,tests:t}}})},[G.nameplate.tapVoltages,O]),(0,m.useEffect)(()=>{O&&K(e=>{let t=e.turnsRatio.tests.map(t=>{let n=parseInt(t.tap)-1,r=e.nameplate.tapVoltages[n],i=``,a=parseFloat(e.turnsRatio.secondaryWindingVoltage),o=parseFloat(r);o&&!isNaN(o)&&a&&!isNaN(a)&&(i=(o/a).toFixed(4));let s=(e,t)=>{if(!e||!t)return{deviation:``,passFail:``};let n=parseFloat(e),r=parseFloat(t);if(isNaN(n)||isNaN(r))return{deviation:``,passFail:``};let i=((r-n)/r*100).toFixed(3),a=parseFloat(i);return{deviation:i,passFail:a>-.501&&a<.501?`PASS`:`FAIL`}},c=s(t.measuredH1H2,i),l=s(t.measuredH2H3,i),u=s(t.measuredH3H1,i);return{...t,calculatedRatio:i,devH1H2:c.deviation,passFailH1H2:c.passFail,devH2H3:l.deviation,passFailH2H3:l.passFail,devH3H1:u.deviation,passFailH3H1:u.passFail}});return{...e,turnsRatio:{...e.turnsRatio,tests:t}}})},[G.nameplate.tapVoltages,G.turnsRatio.secondaryWindingVoltage,G.turnsRatio.tests.map(e=>e.tap).join(`,`),G.turnsRatio.tests.map(e=>e.measuredH1H2).join(`,`),G.turnsRatio.tests.map(e=>e.measuredH2H3).join(`,`),G.turnsRatio.tests.map(e=>e.measuredH3H1).join(`,`),O]);let pe=e=>{O&&(N(!1),K(t=>({...t,temperature:{...t.temperature,fahrenheit:e}})))},me=e=>{if(!O)return;N(!1);let t=e*9/5+32,n=_(e);K(r=>({...r,temperature:{...r.temperature,celsius:e,fahrenheit:parseFloat(t.toFixed(2)),tcf:n}}))},X=(e,t)=>{O&&(N(!1),K(n=>{let r={...n};if(e.includes(`.`)){let n=e.split(`.`),i=r;for(let e=0;e<n.length-1;e++)i[n[e]]||(i[n[e]]={}),i=i[n[e]];i[n[n.length-1]]=t,e===`nameplate.voltsSecondary`&&(r.turnsRatio.secondaryWindingVoltage=t)}else r[e]=t;if(e===`nameplate.voltsPrimary`||e===`nameplate.voltsSecondary`){let e=parseFloat(r.nameplate.voltsPrimary)||0,t=parseFloat(r.nameplate.voltsSecondary)||0;r.insulationResistance.tests=r.insulationResistance.tests.map((n,r)=>{let i=`0.5`;return r===0?e>5e3?i=`25`:e>600&&(i=`5`):r===1?t>5e3?i=`25`:t>600&&(i=`5`):r===2&&(e>5e3?i=`25`:e>600&&(i=`5`)),{...n,tableMinimum:i,tableMinimumUnits:`GΩ`}})}return r}))},he=(e,t,n,r)=>{O&&(N(!1),K(i=>{let a=[...i[e]];return a[t]={...a[t],[n]:r},{...i,[e]:a}}))},Z=(e,t,n,r)=>{O&&(N(!1),K(i=>{let a=i[e],o=[...a.tests];if(o[t]={...o[t],[n]:r},e===`turnsRatio`&&n===`tap`){let e=parseInt(r)-1;if(e>=0&&e<i.nameplate.tapVoltages.length){let n=i.nameplate.tapVoltages[e];n&&(o[t].nameplateVoltage=n)}}return{...i,[e]:{...a,tests:o}}}))},Q=m.useCallback(async()=>{if(!e||!w?.id)return;let t={job_id:e,user_id:w.id,report_data:G,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};try{if(j(!0),I.current)await p.schema(`neta_ops`).from(`two_small_dry_type_xfmr_mts_reports`).update(t).eq(`id`,I.current);else if(L.current)R.current=!0;else{L.current=!0;try{let n=await p.schema(`neta_ops`).from(`two_small_dry_type_xfmr_mts_reports`).insert(t).select().single();if(n.data){let t=n.data.id;I.current=t;let r={name:l(B,G.identifier||G.eqptLocation||G.location||``),file_url:`report:/jobs/${e}/${B}/${t}`,user_id:w.id},{data:i}=await p.schema(`neta_ops`).from(`assets`).insert(r).select().single();i&&await p.schema(`neta_ops`).from(`job_assets`).insert({job_id:e,asset_id:i.id,user_id:w.id}),g(t),L.current=!1,F.current=!0,window.history.replaceState({},``,`/jobs/${e}/${B}/${t}`)}else L.current=!1}catch(e){throw L.current=!1,e}}}catch(e){console.error(`Auto-save error:`,e)}finally{j(!1),R.current&&(R.current=!1,setTimeout(()=>Q(),0))}},[e,w?.id,G,B]);(0,m.useEffect)(()=>{if(!(!O||E))return P.current&&clearTimeout(P.current),P.current=setTimeout(()=>{Q()},500),()=>{P.current&&clearTimeout(P.current)}},[G,O,E,Q]);let $=async()=>{if(!e||!w?.id||!O)return;let t=!!(n||I.current);console.log(`Saving formData:`,G),console.log(`Saving testEquipment:`,G.testEquipment);let r={job_id:e,user_id:w.id,report_data:G,created_at:n?void 0:new Date().toISOString(),updated_at:new Date().toISOString()};try{M(!0);let n;if(I.current)n=await p.schema(`neta_ops`).from(`two_small_dry_type_xfmr_mts_reports`).update(r).eq(`id`,I.current).select().single();else if(L.current){let e=await fe();if(!e){R.current=!0;return}n=await p.schema(`neta_ops`).from(`two_small_dry_type_xfmr_mts_reports`).update(r).eq(`id`,e).select().single()}else{L.current=!0;try{if(n=await p.schema(`neta_ops`).from(`two_small_dry_type_xfmr_mts_reports`).insert(r).select().single(),n.data){I.current=n.data.id,g(n.data.id);let t={name:l(B,G.identifier||G.eqptLocation||G.location||``),file_url:`report:/jobs/${e}/${B}/${n.data.id}`,user_id:w.id},{data:r,error:i}=await p.schema(`neta_ops`).from(`assets`).insert(t).select(`id`).single();if(i)throw i;if(!r)throw Error(`Failed to retrieve ID for new asset.`);await p.schema(`neta_ops`).from(`job_assets`).insert({job_id:e,asset_id:r.id,user_id:w.id})}else L.current=!1}catch(e){throw L.current=!1,e}}if(n?.error)throw n.error;if(t)N(!0);else{k(!1);let t=n?.data?.id;t&&C(`/jobs/${e}/${B}/${t}`,{replace:!0})}}catch(e){console.error(`Error saving report:`,e),alert(`Failed to save report: ${e?.message||`Unknown error`}`)}finally{M(!1)}};return E?(0,h.jsx)(`div`,{className:`flex justify-center items-center h-screen`,children:(0,h.jsx)(`div`,{className:`text-xl font-semibold dark:text-white`,children:(0,h.jsx)(ee,{size:`md`})})}):H?(0,h.jsx)(`div`,{className:`flex justify-center items-center h-screen`,children:(0,h.jsxs)(`div`,{className:`text-xl font-semibold text-red-500`,children:[`Error: `,H]})}):(0,h.jsxs)(ne,{isPrintMode:z,children:[(0,h.jsxs)(`div`,{className:`print-report-header print:flex hidden items-center justify-between border-b-2 border-neutral-800 pb-4 mb-6 print:pb-2 print:mb-4`,children:[(0,h.jsx)(`div`,{style:{width:`120px`,display:`flex`,justifyContent:`flex-start`},children:(0,h.jsx)(`img`,{src:`https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png`,alt:`AMP Logo`,className:`h-10 w-auto`,style:{maxHeight:35,marginLeft:`5px`,marginTop:`2px`}})}),(0,h.jsx)(`div`,{className:`flex-1 text-center`,children:(0,h.jsx)(`h1`,{className:`text-2xl font-bold text-black mb-1 print:text-sm print:mb-0 print:leading-snug`,children:V})}),(0,h.jsxs)(`div`,{className:`text-right font-extrabold text-xl`,style:{color:`#1a4e7c`,width:`120px`},children:[`NETA - MTS 7.2.1.1`,(0,h.jsx)(`div`,{className:`hidden print:block mt-2`,children:(0,h.jsx)(`div`,{className:`pass-fail-status-box ${te(G.status)}`,style:{display:`inline-block`,padding:`4px 10px`,fontSize:`12px`,fontWeight:`bold`,textAlign:`center`,width:`fit-content`,borderRadius:`6px`,color:`white`,WebkitPrintColorAdjust:`exact`,printColorAdjust:`exact`,boxSizing:`border-box`,minWidth:`50px`},children:G.status||`PASS`})})]})]}),(0,h.jsxs)(`div`,{className:`two-small-xfmr-mts-print-root w-full`,children:[(0,h.jsx)(`div`,{className:`${z?`hidden`:``} print:hidden`,children:(0,h.jsx)(c,{title:V,isAutoSaving:A,isEditing:O,justSaved:de,isSaving:ue||E,status:G.status,hasReport:!!n,onStatusToggle:()=>{O&&(N(!1),K(e=>({...e,status:e.status===`PASS`?`FAIL`:`PASS`})))},onSave:$,onSaveAndClose:async()=>{await $(),I.current&&k(!1)},onEdit:()=>k(!0),onBack:()=>C(`/jobs/${e}`),onPrint:()=>window.print(),isPrintMode:z})}),(0,h.jsxs)(`section`,{className:`mb-6 print:mb-3`,children:[(0,h.jsx)(`div`,{className:`report-section-divider w-full h-1 bg-[#f26722] mb-3`}),(0,h.jsx)(`h2`,{className:`report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs`,children:`Job Information`}),(0,h.jsxs)(`div`,{className:`grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 print:hidden job-info-onscreen`,children:[(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`customer`,className:`form-label`,children:`Customer:`}),(0,h.jsx)(`input`,{id:`customer`,type:`text`,name:`customer`,value:T(G.customer),onChange:e=>X(`customer`,e.target.value),readOnly:!0,className:`form-input text-sm bg-neutral-100 dark:bg-dark-150 cursor-not-allowed`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`address`,className:`form-label`,children:`Address:`}),(0,h.jsx)(`input`,{id:`address`,type:`text`,name:`address`,value:G.address,onChange:e=>X(`address`,e.target.value),readOnly:!0,className:`form-input text-sm bg-neutral-100 dark:bg-dark-150 cursor-not-allowed`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`jobNumber`,className:`form-label`,children:`Job Number:`}),(0,h.jsx)(`input`,{id:`jobNumber`,type:`text`,name:`jobNumber`,value:G.jobNumber,onChange:e=>X(`jobNumber`,e.target.value),readOnly:!0,className:`form-input text-sm bg-neutral-100 dark:bg-dark-150 cursor-not-allowed`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`date`,className:`form-label`,children:`Date:`}),(0,h.jsx)(`input`,{id:`date`,type:`date`,name:`date`,value:G.date,onChange:e=>X(`date`,e.target.value),readOnly:!O,className:`form-input text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`technicians`,className:`form-label`,children:`Technicians:`}),(0,h.jsx)(`input`,{id:`technicians`,type:`text`,name:`technicians`,value:G.technicians,onChange:e=>X(`technicians`,e.target.value),readOnly:!O,className:`form-input text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`identifier`,className:`form-label`,children:`Identifier:`}),(0,h.jsx)(`input`,{id:`identifier`,type:`text`,name:`identifier`,value:G.identifier,onChange:e=>X(`identifier`,e.target.value),readOnly:!O,className:`form-input text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{className:`grid grid-cols-2 gap-x-2`,children:[(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`tempF`,className:`form-label`,children:`Temp (°F):`}),(0,h.jsx)(`div`,{className:`flex items-center`,children:(0,h.jsx)(`input`,{id:`tempF`,type:`number`,value:G.temperature.fahrenheit,onChange:e=>pe(parseFloat(e.target.value)),readOnly:!O,className:`form-input text-sm w-full ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`tempC`,className:`form-label`,children:`Temp (°C):`}),(0,h.jsx)(`div`,{className:`flex items-center`,children:(0,h.jsx)(`input`,{id:`tempC`,type:`number`,value:G.temperature.celsius,onChange:e=>me(parseFloat(e.target.value)),readOnly:!O,className:`form-input text-sm w-full ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})})]})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`user`,className:`form-label`,children:`User:`}),(0,h.jsx)(`input`,{id:`user`,type:`text`,name:`user`,value:G.user,onChange:e=>X(`user`,e.target.value),readOnly:!O,className:`form-input text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`humidity`,className:`form-label`,children:`Humidity (%):`}),(0,h.jsx)(`div`,{className:`flex items-center`,children:(0,h.jsx)(`input`,{id:`humidity`,type:`number`,name:`temperature.humidity`,value:G.temperature.humidity,onChange:e=>X(`temperature.humidity`,parseFloat(e.target.value)),readOnly:!O,className:`form-input text-sm w-full ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})})]}),(0,h.jsxs)(`div`,{className:`flex items-center mt-auto mb-1`,children:[(0,h.jsx)(`label`,{className:`form-label mr-2`,children:`TCF:`}),(0,h.jsx)(`span`,{className:`font-medium text-neutral-900 dark:text-white`,children:G.temperature.tcf})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`substation`,className:`form-label`,children:`Substation:`}),(0,h.jsx)(`input`,{id:`substation`,type:`text`,name:`substation`,value:G.substation,onChange:e=>X(`substation`,e.target.value),readOnly:!O,className:`form-input text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{htmlFor:`eqptLocation`,className:`form-label`,children:`Eqpt. Location:`}),(0,h.jsx)(`input`,{id:`eqptLocation`,type:`text`,name:`eqptLocation`,value:G.eqptLocation,onChange:e=>X(`eqptLocation`,e.target.value),readOnly:!O,className:`form-input text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]})]}),(0,h.jsx)(`div`,{className:`report-section-content hidden print:block`,children:(0,h.jsx)(ie,{data:{customer:T(G.customer),address:G.address,jobNumber:G.jobNumber,technicians:G.technicians,date:G.date,identifier:G.identifier,user:G.user,substation:G.substation,eqptLocation:G.eqptLocation,temperature:{...G.temperature}}})})]}),(0,h.jsxs)(`section`,{className:`mb-6 print:mb-3`,children:[(0,h.jsx)(`div`,{className:`report-section-divider w-full h-1 bg-[#f26722] mb-3`}),(0,h.jsx)(`h2`,{className:`report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs`,children:`Nameplate Data`}),(0,h.jsxs)(`div`,{className:`space-y-4 print:hidden nameplate-onscreen`,children:[(0,h.jsxs)(`div`,{className:`grid grid-cols-3 gap-4`,children:[(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-700 dark:text-white`,children:`Manufacturer`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.manufacturer,onChange:e=>X(`nameplate.manufacturer`,e.target.value),readOnly:!O,className:`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-700 dark:text-white`,children:`Catalog Number`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.catalogNumber,onChange:e=>X(`nameplate.catalogNumber`,e.target.value),readOnly:!O,className:`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-700 dark:text-white`,children:`Serial Number`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.serialNumber,onChange:e=>X(`nameplate.serialNumber`,e.target.value),readOnly:!O,className:`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]})]}),(0,h.jsxs)(`div`,{className:`grid grid-cols-3 gap-4 items-end`,children:[(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-700 dark:text-white`,children:`KVA`}),(0,h.jsxs)(`div`,{className:`flex items-center space-x-1 mt-1`,children:[(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.kvaBase,onChange:e=>X(`nameplate.kvaBase`,e.target.value),readOnly:!O,className:`w-20 rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`}),(0,h.jsx)(`span`,{className:`text-neutral-500`,children:`/`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.kvaCooling,onChange:e=>X(`nameplate.kvaCooling`,e.target.value),readOnly:!O,className:`w-20 rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-700 dark:text-white`,children:`Temp. Rise (°C)`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.tempRise,onChange:e=>X(`nameplate.tempRise`,e.target.value),readOnly:!O,className:`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-700 dark:text-white`,children:`Impedance (%)`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.impedance,onChange:e=>X(`nameplate.impedance`,e.target.value),readOnly:!O,className:`mt-1 block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]})]}),(0,h.jsxs)(`div`,{className:`grid grid-cols-[100px_1fr_1fr_1fr] gap-4 mt-4`,children:[(0,h.jsx)(`div`,{}),(0,h.jsx)(`div`,{className:`text-center font-medium text-sm text-neutral-700 dark:text-white`,children:`Volts`}),(0,h.jsx)(`div`,{className:`text-center font-medium text-sm text-neutral-700 dark:text-white`,children:`Connections`}),(0,h.jsx)(`div`,{className:`text-center font-medium text-sm text-neutral-700 dark:text-white`,children:`Winding Material`})]}),(0,h.jsxs)(`div`,{className:`grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center`,children:[(0,h.jsx)(`div`,{className:`text-sm font-medium text-neutral-700 dark:text-white`,children:`Primary`}),(0,h.jsxs)(`div`,{className:`flex items-center justify-center space-x-1`,children:[(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.voltsPrimary,onChange:e=>X(`nameplate.voltsPrimary`,e.target.value),readOnly:!O,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`}),(0,h.jsx)(`span`,{className:`text-neutral-500`,children:`/`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.voltsPrimarySecondary,onChange:e=>X(`nameplate.voltsPrimarySecondary`,e.target.value),readOnly:!O,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsx)(`div`,{className:`flex justify-center space-x-4 connections-group`,children:[`Delta`,`Wye`,`Single Phase`].map(e=>(0,h.jsxs)(`label`,{className:`inline-flex items-center`,children:[(0,h.jsx)(`input`,{type:`radio`,name:`primary-connection`,value:e,checked:G.nameplate.connectionsPrimary===e,onChange:()=>X(`nameplate.connectionsPrimary`,e),disabled:!O,className:`form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]`}),(0,h.jsx)(`span`,{className:`ml-2 text-sm text-neutral-700 dark:text-white`,children:e})]},`pri-${e}`))}),(0,h.jsx)(`div`,{className:`flex justify-center space-x-4 materials-group`,children:[`Aluminum`,`Copper`].map(e=>(0,h.jsxs)(`label`,{className:`inline-flex items-center`,children:[(0,h.jsx)(`input`,{type:`radio`,name:`primary-material`,value:e,checked:G.nameplate.windingMaterialPrimary===e,onChange:()=>X(`nameplate.windingMaterialPrimary`,e),disabled:!O,className:`form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]`}),(0,h.jsx)(`span`,{className:`ml-2 text-sm text-neutral-700 dark:text-white`,children:e})]},`pri-${e}`))})]}),(0,h.jsxs)(`div`,{className:`grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center`,children:[(0,h.jsx)(`div`,{className:`text-sm font-medium text-neutral-700 dark:text-white`,children:`Secondary`}),(0,h.jsxs)(`div`,{className:`flex items-center justify-center space-x-1`,children:[(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.voltsSecondary,onChange:e=>X(`nameplate.voltsSecondary`,e.target.value),readOnly:!O,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`}),(0,h.jsx)(`span`,{className:`text-neutral-500`,children:`/`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.voltsSecondarySecondary,onChange:e=>X(`nameplate.voltsSecondarySecondary`,e.target.value),readOnly:!O,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsx)(`div`,{className:`flex justify-center space-x-4 connections-group`,children:[`Delta`,`Wye`,`Single Phase`].map(e=>(0,h.jsxs)(`label`,{className:`inline-flex items-center`,children:[(0,h.jsx)(`input`,{type:`radio`,name:`secondary-connection`,value:e,checked:G.nameplate.connectionsSecondary===e,onChange:()=>X(`nameplate.connectionsSecondary`,e),disabled:!O,className:`form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]`}),(0,h.jsx)(`span`,{className:`ml-2 text-sm text-neutral-700 dark:text-white`,children:e})]},`sec-${e}`))}),(0,h.jsx)(`div`,{className:`flex justify-center space-x-4 materials-group`,children:[`Aluminum`,`Copper`].map(e=>(0,h.jsxs)(`label`,{className:`inline-flex items-center`,children:[(0,h.jsx)(`input`,{type:`radio`,name:`secondary-material`,value:e,checked:G.nameplate.windingMaterialSecondary===e,onChange:()=>X(`nameplate.windingMaterialSecondary`,e),disabled:!O,className:`form-radio h-4 w-4 text-[#f26722] border-neutral-300 dark:border-neutral-700 focus:ring-[#f26722]`}),(0,h.jsx)(`span`,{className:`ml-2 text-sm text-neutral-700 dark:text-white`,children:e})]},`sec-${e}`))})]}),(0,h.jsxs)(`div`,{className:`space-y-2`,children:[(0,h.jsxs)(`div`,{className:`flex items-center`,children:[(0,h.jsx)(`label`,{className:`w-[130px] text-sm font-medium text-neutral-700 dark:text-white flex-shrink-0`,children:`Tap Voltages`}),(0,h.jsx)(`div`,{className:`grid grid-cols-7 gap-2 flex-grow`,children:G.nameplate.tapVoltages.map((e,t)=>(0,h.jsx)(`input`,{type:`text`,value:e,onChange:e=>{let n=[...G.nameplate.tapVoltages];n[t]=e.target.value,X(`nameplate.tapVoltages`,n)},readOnly:!O,className:`block w-full rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white text-center ${O?``:`bg-neutral-100 dark:bg-dark-150`}`},t))})]}),(0,h.jsxs)(`div`,{className:`flex items-center`,children:[(0,h.jsx)(`label`,{className:`w-[130px] text-sm font-medium text-neutral-700 dark:text-white flex-shrink-0`,children:`Tap Position`}),(0,h.jsx)(`div`,{className:`grid grid-cols-7 gap-2 flex-grow`,children:[1,2,3,4,5,6,7].map(e=>(0,h.jsx)(`div`,{className:`text-center text-sm text-neutral-700 dark:text-white font-medium`,children:e},e))})]}),(0,h.jsxs)(`div`,{className:`flex items-center`,children:[(0,h.jsx)(`label`,{className:`w-[130px] text-sm font-medium text-neutral-700 dark:text-white flex-shrink-0`,children:`Tap Position Left`}),(0,h.jsxs)(`div`,{className:`flex items-center space-x-1 mr-4`,children:[(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.tapPosition,onChange:e=>X(`nameplate.tapPosition`,e.target.value),readOnly:!O,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`}),(0,h.jsx)(`span`,{className:`text-neutral-500`,children:`/`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.tapPosition,readOnly:!0,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white bg-neutral-100 dark:bg-dark-150`})]}),(0,h.jsxs)(`div`,{className:`flex items-center space-x-1 mr-4`,children:[(0,h.jsx)(`span`,{className:`text-sm font-medium text-neutral-700 dark:text-white`,children:`Volts`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.tapPositionLeftVolts,onChange:e=>X(`nameplate.tapPositionLeftVolts`,e.target.value),readOnly:!O,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{className:`flex items-center space-x-1`,children:[(0,h.jsx)(`span`,{className:`text-sm font-medium text-neutral-700 dark:text-white`,children:`Percent`}),(0,h.jsx)(`input`,{type:`text`,value:G.nameplate.tapPositionLeftPercent,onChange:e=>X(`nameplate.tapPositionLeftPercent`,e.target.value),readOnly:!O,className:`w-16 text-center rounded-md border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 shadow-sm dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]})]})]})]}),(0,h.jsxs)(`div`,{className:`report-section-content hidden print:block space-y-3`,children:[(0,h.jsxs)(`table`,{className:`min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 nameplate-table`,children:[(0,h.jsxs)(`colgroup`,{children:[(0,h.jsx)(`col`,{style:{width:`33.33%`}}),(0,h.jsx)(`col`,{style:{width:`33.33%`}}),(0,h.jsx)(`col`,{style:{width:`33.33%`}})]}),(0,h.jsxs)(`tbody`,{children:[(0,h.jsxs)(`tr`,{children:[(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white`,children:[(0,h.jsx)(`div`,{className:`text-xs font-bold`,children:`Manufacturer:`}),(0,h.jsx)(`div`,{className:`text-sm mt-0.5`,children:G.nameplate.manufacturer||``})]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white`,children:[(0,h.jsx)(`div`,{className:`text-xs font-bold`,children:`Catalog Number:`}),(0,h.jsx)(`div`,{className:`text-sm mt-0.5`,children:G.nameplate.catalogNumber||``})]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white`,children:[(0,h.jsx)(`div`,{className:`text-xs font-bold`,children:`Serial Number:`}),(0,h.jsx)(`div`,{className:`text-sm mt-0.5`,children:G.nameplate.serialNumber||``})]})]}),(0,h.jsxs)(`tr`,{children:[(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white`,children:[(0,h.jsx)(`div`,{className:`text-xs font-bold`,children:`KVA:`}),(0,h.jsxs)(`div`,{className:`text-sm mt-0.5`,children:[G.nameplate.kvaBase||``,G.nameplate.kvaCooling?` / ${G.nameplate.kvaCooling}`:``]})]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white`,children:[(0,h.jsx)(`div`,{className:`text-xs font-bold`,children:`Temp. Rise (°C):`}),(0,h.jsx)(`div`,{className:`text-sm mt-0.5`,children:G.nameplate.tempRise||``})]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white`,children:[(0,h.jsx)(`div`,{className:`text-xs font-bold`,children:`Impedance:`}),(0,h.jsx)(`div`,{className:`text-sm mt-0.5`,children:G.nameplate.impedance||``})]})]})]})]}),(0,h.jsxs)(`table`,{className:`min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 nameplate-table`,children:[(0,h.jsxs)(`colgroup`,{children:[(0,h.jsx)(`col`,{style:{width:`12%`}}),(0,h.jsx)(`col`,{style:{width:`18%`}}),(0,h.jsx)(`col`,{style:{width:`16%`}}),(0,h.jsx)(`col`,{style:{width:`16%`}}),(0,h.jsx)(`col`,{style:{width:`16%`}}),(0,h.jsx)(`col`,{style:{width:`9%`}}),(0,h.jsx)(`col`,{style:{width:`9%`}})]}),(0,h.jsx)(`thead`,{children:(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,colSpan:1,children:`Volts`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,colSpan:3,children:`Connections`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,colSpan:2,children:`Winding Materials`})]})}),(0,h.jsxs)(`tbody`,{children:[(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white`,children:`Primary`}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.voltsPrimary||``,` /`,` `,G.nameplate.voltsPrimarySecondary||``]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.connectionsPrimary===`Delta`?`☒`:`☐`,` `,`Delta`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.connectionsPrimary===`Wye`?`☒`:`☐`,` `,`Wye`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.connectionsPrimary===`Single Phase`?`☒`:`☐`,` `,`Single Phase`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.windingMaterialPrimary===`Aluminum`?`☒`:`☐`,` `,`Aluminum`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.windingMaterialPrimary===`Copper`?`☒`:`☐`,` `,`Copper`]})]}),(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white`,children:`Secondary`}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.voltsSecondary||``,` /`,` `,G.nameplate.voltsSecondarySecondary||``]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.connectionsSecondary===`Delta`?`☒`:`☐`,` `,`Delta`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.connectionsSecondary===`Wye`?`☒`:`☐`,` `,`Wye`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.connectionsSecondary===`Single Phase`?`☒`:`☐`,` `,`Single Phase`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.windingMaterialSecondary===`Aluminum`?`☒`:`☐`,` `,`Aluminum`]}),(0,h.jsxs)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:[G.nameplate.windingMaterialSecondary===`Copper`?`☒`:`☐`,` `,`Copper`]})]})]})]}),(0,h.jsxs)(`table`,{className:`min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 nameplate-table`,children:[(0,h.jsx)(`thead`,{children:(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Tap Position`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`1`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`2`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`3`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`4`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`5`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`6`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`7`})]})}),(0,h.jsxs)(`tbody`,{children:[(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white`,children:`Tap Voltages`}),G.nameplate.tapVoltages.map((e,t)=>(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white text-center`,children:e||``},t))]}),(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-900 dark:text-white`,children:`Tap Position Left`}),(0,h.jsxs)(`td`,{colSpan:7,className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-900 dark:text-white`,children:[`Position: `,G.nameplate.tapPosition||``,` /`,` `,G.nameplate.tapPosition||``,` | Volts:`,` `,G.nameplate.tapPositionLeftVolts||``,` | Percent:`,` `,G.nameplate.tapPositionLeftPercent||``]})]})]})]})]})]}),(0,h.jsxs)(`section`,{className:`mb-6 print:mb-3`,children:[(0,h.jsx)(`div`,{className:`report-section-divider w-full h-1 bg-[#f26722] mb-3`}),(0,h.jsx)(`h2`,{className:`report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs`,children:`Visual and Mechanical Inspection`}),(0,h.jsx)(`div`,{className:`report-section-content overflow-x-auto`,children:(0,h.jsxs)(`table`,{className:`min-w-full divide-y divide-neutral-200 dark:divide-neutral-700 visual-mechanical-table table-fixed`,children:[(0,h.jsxs)(`colgroup`,{children:[(0,h.jsx)(`col`,{style:{width:`6%`}}),(0,h.jsx)(`col`,{style:{width:`70%`}}),(0,h.jsx)(`col`,{style:{width:`24%`}})]}),(0,h.jsx)(`thead`,{className:`bg-neutral-50 dark:bg-dark-150`,children:(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{scope:`col`,className:`px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider`,children:`NETA Section`}),(0,h.jsx)(`th`,{scope:`col`,className:`px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider`,children:`Description`}),(0,h.jsx)(`th`,{scope:`col`,className:`px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-white uppercase tracking-wider`,children:`Result`})]})}),(0,h.jsx)(`tbody`,{className:`bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-neutral-700`,children:G.visualInspectionItems.map((e,t)=>(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white`,children:e.netaSection}),(0,h.jsx)(`td`,{className:`px-6 py-4 whitespace-normal text-sm text-neutral-900 dark:text-white`,children:e.description}),(0,h.jsxs)(`td`,{className:`px-6 py-4 whitespace-nowrap text-sm`,children:[(0,h.jsx)(`div`,{className:`print:hidden`,children:(0,h.jsx)(`select`,{value:e.result,onChange:e=>he(`visualInspectionItems`,t,`result`,e.target.value),disabled:!O,className:`form-select w-full text-sm ${O?`dark:bg-dark-150`:`bg-neutral-100 dark:bg-dark-150 cursor-not-allowed`}`,children:ae.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})}),(0,h.jsx)(`div`,{className:`hidden print:block text-center`,children:e.result||``})]})]},t))})]})}),(0,h.jsx)(`div`,{className:`report-section-content hidden print:block mt-3 ${G.visualInspectionComments?.trim()?``:`print:hidden`}`,children:(0,h.jsxs)(`table`,{className:`min-w-full border-collapse border border-neutral-300 dark:border-neutral-600`,children:[(0,h.jsx)(`thead`,{children:(0,h.jsx)(`tr`,{children:(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Visual Inspection Comments`})})}),(0,h.jsx)(`tbody`,{children:(0,h.jsx)(`tr`,{children:(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white text-sm min-h-[60px] align-top`,children:G.visualInspectionComments||``})})})]})})]}),(0,h.jsxs)(`section`,{className:`mb-6 print:mb-3`,children:[(0,h.jsx)(`div`,{className:`report-section-divider w-full h-1 bg-[#f26722] mb-3`}),(0,h.jsx)(`h2`,{className:`report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs`,children:`Electrical Tests - Measured Insulation Resistance`}),(0,h.jsx)(`div`,{className:`report-section-content w-full max-w-full overflow-x-auto`,children:(0,h.jsxs)(`table`,{className:`w-full border-collapse border border-neutral-300 dark:border-neutral-600 insulation-resistance-table`,style:{tableLayout:`fixed`},children:[(0,h.jsxs)(`colgroup`,{children:[(0,h.jsx)(`col`,{style:{width:`16%`}}),(0,h.jsx)(`col`,{style:{width:`8%`}}),(0,h.jsx)(`col`,{style:{width:`9%`}}),(0,h.jsx)(`col`,{style:{width:`9%`}}),(0,h.jsx)(`col`,{style:{width:`7%`}}),(0,h.jsx)(`col`,{style:{width:`9%`}}),(0,h.jsx)(`col`,{style:{width:`9%`}}),(0,h.jsx)(`col`,{style:{width:`7%`}}),(0,h.jsx)(`col`,{style:{width:`9%`}}),(0,h.jsx)(`col`,{style:{width:`7%`}})]}),(0,h.jsxs)(`thead`,{children:[(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-left text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Winding Tested`}),(0,h.jsxs)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight`,children:[`Test V`,(0,h.jsx)(`br`,{}),`(VDC)`]}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`0.5 Min.`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`1 Min.`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Units`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`0.5 Min.`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`1 Min.`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Units`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Value`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Units`})]}),(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`}),(0,h.jsx)(`th`,{className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`}),(0,h.jsx)(`th`,{colSpan:3,className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight`,children:`Measured`}),(0,h.jsx)(`th`,{colSpan:3,className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight`,children:`Corrected @ 20°C`}),(0,h.jsx)(`th`,{colSpan:2,className:`px-1 py-1 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight`,children:`Table 100.5`})]})]}),(0,h.jsx)(`tbody`,{children:G.insulationResistance.tests.map((e,t)=>(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-1 py-1 text-xs text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-600 whitespace-normal leading-tight`,children:e.winding}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.testVoltage,onChange:e=>Z(`insulationResistance`,t,`testVoltage`,e.target.value),disabled:!O,className:`form-select w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:oe.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.measured0_5Min,onChange:e=>Z(`insulationResistance`,t,`measured0_5Min`,e.target.value),readOnly:!O,className:`form-input w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.measured1Min,onChange:e=>Z(`insulationResistance`,t,`measured1Min`,e.target.value),readOnly:!O,className:`form-input w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.units,onChange:e=>Z(`insulationResistance`,t,`units`,e.target.value),disabled:!O,className:`form-select w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:v.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:Y(e.measured0_5Min,_(G.temperature.celsius)),readOnly:!0,className:`form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150`})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:Y(e.measured1Min,_(G.temperature.celsius)),readOnly:!0,className:`form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150`})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.correctedUnits,onChange:e=>Z(`insulationResistance`,t,`correctedUnits`,e.target.value),disabled:!O,className:`form-select w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:v.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.tableMinimum,onChange:e=>Z(`insulationResistance`,t,`tableMinimum`,e.target.value),readOnly:!O,className:`form-input w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),(0,h.jsx)(`td`,{className:`px-1 py-1 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.tableMinimumUnits,onChange:e=>Z(`insulationResistance`,t,`tableMinimumUnits`,e.target.value),disabled:!O,className:`form-select w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:v.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})})]},t))})]})}),(0,h.jsx)(`div`,{className:`report-section-content mt-3`,children:(0,h.jsxs)(`table`,{className:`min-w-full border-collapse border border-neutral-300 dark:border-neutral-600 dielectric-absorption-table`,children:[(0,h.jsx)(`thead`,{children:(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-left text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Calculated As:`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Pri to Gnd`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Sec to Gnd`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Pri to Sec`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Pass/Fail`}),(0,h.jsx)(`th`,{className:`px-3 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-sm font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Min. D.A.R.`})]})}),(0,h.jsx)(`tbody`,{children:(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-3 py-2 text-left border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`div`,{className:`text-sm text-neutral-900 dark:text-white`,children:`Dielectric Absorption : (Ratio of 1 Minute to 0.5 Minute Result)`})}),G.insulationResistance.tests.map((e,t)=>(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.dielectricAbsorption,readOnly:!0,className:`form-input text-center text-sm bg-neutral-100 dark:bg-dark-150 w-full`})},t)),(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:G.insulationResistance.dielectricAbsorptionAcceptable,readOnly:!0,className:`form-input text-center text-sm bg-neutral-100 dark:bg-dark-150 w-full ${G.insulationResistance.dielectricAbsorptionAcceptable===`Yes`?`text-green-600 font-medium`:G.insulationResistance.dielectricAbsorptionAcceptable===`No`?`text-red-600 font-medium`:``}`})}),(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:`1.0`,readOnly:!0,className:`form-input text-center text-sm bg-neutral-100 dark:bg-dark-150 w-full`})})]})})]})})]}),(0,h.jsxs)(`section`,{className:`mb-6 print:mb-3`,children:[(0,h.jsx)(`div`,{className:`report-section-divider w-full h-1 bg-[#f26722] mb-3`}),(0,h.jsx)(`h2`,{className:`report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs`,children:`Electrical Tests - Turns Ratio`}),(0,h.jsxs)(`div`,{className:`report-section-content flex justify-start items-center gap-2 mb-3 turns-ratio-secondary-label text-xs print:text-[8px]`,children:[(0,h.jsx)(`label`,{htmlFor:`turnsRatio.secondaryWindingVoltage`,className:`form-label mb-0 whitespace-nowrap`,children:`Secondary Winding Voltage (L-N for Wye, L-L for Delta):`}),(0,h.jsx)(`input`,{id:`turnsRatio.secondaryWindingVoltage`,type:`text`,name:`turnsRatio.secondaryWindingVoltage`,value:G.turnsRatio.secondaryWindingVoltage,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,className:`form-input w-24 text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`}),(0,h.jsx)(`span`,{children:`V`})]}),(0,h.jsxs)(`div`,{className:`report-section-content space-y-3`,children:[(0,h.jsx)(`div`,{className:`overflow-x-auto`,children:(0,h.jsxs)(`table`,{className:`w-full border-collapse turns-ratio-setup-table`,style:{tableLayout:`fixed`},children:[(0,h.jsxs)(`colgroup`,{children:[(0,h.jsx)(`col`,{style:{width:`33.3333%`}}),(0,h.jsx)(`col`,{style:{width:`33.3333%`}}),(0,h.jsx)(`col`,{style:{width:`33.3333%`}})]}),(0,h.jsx)(`thead`,{children:(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Tap`}),(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Nameplate V.`}),(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Calc. Ratio`})]})}),(0,h.jsx)(`tbody`,{children:G.turnsRatio.tests.map((e,t)=>(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.tap,onChange:e=>Z(`turnsRatio`,t,`tap`,e.target.value),disabled:!O,className:`form-select w-full text-xs text-center ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:Array.from({length:7},(e,t)=>t+1).map(e=>(0,h.jsx)(`option`,{value:e.toString(),children:e},e))})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.nameplateVoltage,onChange:e=>Z(`turnsRatio`,t,`nameplateVoltage`,e.target.value),readOnly:!O,className:`form-input w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.calculatedRatio,readOnly:!0,className:`form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150`})})]},`setup-${t}`))})]})}),(0,h.jsx)(`div`,{className:`overflow-x-auto turns-ratio-scroll`,children:(0,h.jsxs)(`table`,{className:`w-full border-collapse turns-ratio-results-table`,style:{tableLayout:`fixed`},children:[(0,h.jsxs)(`colgroup`,{children:[(0,h.jsx)(`col`,{style:{width:`10%`}}),(0,h.jsx)(`col`,{style:{width:`28%`}}),(0,h.jsx)(`col`,{style:{width:`22%`}}),(0,h.jsx)(`col`,{style:{width:`20%`}}),(0,h.jsx)(`col`,{style:{width:`20%`}})]}),(0,h.jsx)(`thead`,{children:(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Tap`}),(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Winding`}),(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Measured`}),(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`% Dev.`}),(0,h.jsx)(`th`,{className:`px-2 py-2 bg-neutral-50 dark:bg-dark-150 text-center text-xs font-medium text-neutral-700 dark:text-white border border-neutral-300 dark:border-neutral-600`,children:`Pass/Fail`})]})}),(0,h.jsx)(`tbody`,{children:G.turnsRatio.tests.map((e,t)=>(0,h.jsxs)(m.Fragment,{children:[(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{rowSpan:3,className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium align-middle`,children:e.tap}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium`,children:b.h1h2}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.measuredH1H2,onChange:e=>Z(`turnsRatio`,t,`measuredH1H2`,e.target.value),readOnly:!O,className:`form-input w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.devH1H2,readOnly:!0,className:`form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150`})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.passFailH1H2,onChange:e=>Z(`turnsRatio`,t,`passFailH1H2`,e.target.value),disabled:!O,className:`form-select w-full text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:y.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})})]}),(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium`,children:b.h2h3}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.measuredH2H3,onChange:e=>Z(`turnsRatio`,t,`measuredH2H3`,e.target.value),readOnly:!O,className:`form-input w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.devH2H3,readOnly:!0,className:`form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150`})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.passFailH2H3,onChange:e=>Z(`turnsRatio`,t,`passFailH2H3`,e.target.value),disabled:!O,className:`form-select w-full text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:y.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})})]}),(0,h.jsxs)(`tr`,{children:[(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600 text-xs text-center font-medium`,children:b.h3h1}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.measuredH3H1,onChange:e=>Z(`turnsRatio`,t,`measuredH3H1`,e.target.value),readOnly:!O,className:`form-input w-full text-center text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`input`,{type:`text`,value:e.devH3H1,readOnly:!0,className:`form-input w-full text-center text-xs bg-neutral-100 dark:bg-dark-150`})}),(0,h.jsx)(`td`,{className:`px-2 py-2 border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`select`,{value:e.passFailH3H1,onChange:e=>Z(`turnsRatio`,t,`passFailH3H1`,e.target.value),disabled:!O,className:`form-select w-full text-xs ${O?``:`bg-neutral-100 dark:bg-dark-150`}`,children:y.map(e=>(0,h.jsx)(`option`,{value:e,children:e},e))})})]})]},`results-${t}`))})]})})]})]}),(0,h.jsxs)(`section`,{className:`mb-6 print:mb-3`,children:[(0,h.jsx)(`div`,{className:`report-section-divider w-full h-1 bg-[#f26722] mb-3`}),(0,h.jsx)(`h2`,{className:`report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs`,children:`Test Equipment Used`}),(0,h.jsxs)(`div`,{className:`space-y-4 print:hidden test-eqpt-onscreen`,children:[(0,h.jsxs)(`div`,{className:`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`,children:[(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`Megohmmeter`}),(0,h.jsx)(s,{value:G.testEquipment.megohmmeter.name,onChange:e=>X(`testEquipment.megohmmeter.name`,e),onSelect:e=>{K(t=>({...t,testEquipment:{...t.testEquipment,megohmmeter:{name:e.equipment_name,serialNumber:e.serial_number||``,ampId:e.amp_id||``,calDate:f(e.calibration_date)}}}))},readOnly:!O,className:`w-full text-sm`})]}),(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`Serial Number`}),(0,h.jsx)(`input`,{type:`text`,name:`testEquipment.megohmmeter.serialNumber`,value:G.testEquipment.megohmmeter.serialNumber,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,className:`form-input w-full text-sm text-neutral-900 dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`AMP ID`}),(0,h.jsx)(`input`,{type:`text`,name:`testEquipment.megohmmeter.ampId`,value:G.testEquipment.megohmmeter.ampId,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,className:`form-input w-full text-sm text-neutral-900 dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`Cal Date`}),(0,h.jsx)(`input`,{type:`text`,name:`testEquipment.megohmmeter.calDate`,value:G.testEquipment.megohmmeter.calDate,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,className:`form-input w-full text-sm text-neutral-900 dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]})]}),(0,h.jsxs)(`div`,{className:`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`,children:[(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`TTR Test Set`}),(0,h.jsx)(s,{value:G.testEquipment.ttrTestSet.name,onChange:e=>X(`testEquipment.ttrTestSet.name`,e),onSelect:e=>{K(t=>({...t,testEquipment:{...t.testEquipment,ttrTestSet:{name:e.equipment_name,serialNumber:e.serial_number||``,ampId:e.amp_id||``,calDate:f(e.calibration_date)}}}))},readOnly:!O,className:`w-full text-sm`})]}),(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`Serial Number`}),(0,h.jsx)(`input`,{type:`text`,name:`testEquipment.ttrTestSet.serialNumber`,value:G.testEquipment.ttrTestSet.serialNumber,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,className:`form-input w-full text-sm text-neutral-900 dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`AMP ID`}),(0,h.jsx)(`input`,{type:`text`,name:`testEquipment.ttrTestSet.ampId`,value:G.testEquipment.ttrTestSet.ampId,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,className:`form-input w-full text-sm text-neutral-900 dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]}),(0,h.jsxs)(`div`,{className:`min-w-0`,children:[(0,h.jsx)(`label`,{className:`block text-sm font-medium text-neutral-900 dark:text-white mb-1`,children:`Cal Date`}),(0,h.jsx)(`input`,{type:`text`,name:`testEquipment.ttrTestSet.calDate`,value:G.testEquipment.ttrTestSet.calDate,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,className:`form-input w-full text-sm text-neutral-900 dark:text-white ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})]})]})]}),(0,h.jsx)(`div`,{className:`report-section-content hidden print:block`,children:(0,h.jsxs)(`table`,{className:`w-full border-collapse border border-black test-equipment-table`,style:{tableLayout:`fixed`},children:[(0,h.jsxs)(`colgroup`,{children:[(0,h.jsx)(`col`,{style:{width:`50%`}}),(0,h.jsx)(`col`,{style:{width:`50%`}})]}),(0,h.jsx)(`tbody`,{children:(0,h.jsxs)(`tr`,{children:[(0,h.jsxs)(`td`,{className:`p-2 border border-black`,children:[(0,h.jsx)(`div`,{className:`font-semibold text-xs`,children:`Megohmmeter:`}),(0,h.jsx)(`div`,{className:`text-xs`,children:G.testEquipment.megohmmeter.name||``}),(0,h.jsxs)(`div`,{className:`text-xs`,children:[`S/N:`,` `,G.testEquipment.megohmmeter.serialNumber||``]}),(0,h.jsxs)(`div`,{className:`text-xs`,children:[`AMP ID: `,G.testEquipment.megohmmeter.ampId||``]}),G.testEquipment.megohmmeter.calDate&&(0,h.jsxs)(`div`,{className:`text-xs`,children:[`Cal Date: `,G.testEquipment.megohmmeter.calDate]})]}),(0,h.jsxs)(`td`,{className:`p-2 border border-black`,children:[(0,h.jsx)(`div`,{className:`font-semibold text-xs`,children:`TTR Test Set:`}),(0,h.jsx)(`div`,{className:`text-xs`,children:G.testEquipment.ttrTestSet.name||``}),(0,h.jsxs)(`div`,{className:`text-xs`,children:[`S/N:`,` `,G.testEquipment.ttrTestSet.serialNumber||``]}),(0,h.jsxs)(`div`,{className:`text-xs`,children:[`AMP ID: `,G.testEquipment.ttrTestSet.ampId||``]}),G.testEquipment.ttrTestSet.calDate&&(0,h.jsxs)(`div`,{className:`text-xs`,children:[`Cal Date: `,G.testEquipment.ttrTestSet.calDate]})]})]})})]})})]}),(0,h.jsxs)(`section`,{className:`mb-6 comments-section print:mb-3 ${G.comments?.trim()?``:`print:hidden`}`,children:[(0,h.jsx)(`div`,{className:`report-section-divider w-full h-1 bg-[#f26722] mb-3`}),(0,h.jsx)(`h2`,{className:`report-section-heading text-xl font-semibold mb-3 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2 print:text-black print:border-black print:font-bold print:text-xs`,children:`Comments`}),(0,h.jsx)(`div`,{className:`print:hidden`,children:(0,h.jsx)(`textarea`,{name:`comments`,value:G.comments,onChange:e=>X(e.target.name,e.target.value),readOnly:!O,rows:4,className:`form-textarea w-full text-sm ${O?``:`bg-neutral-100 dark:bg-dark-150`}`})}),G.comments?.trim()&&(0,h.jsx)(`div`,{className:`report-section-content hidden print:block`,children:(0,h.jsx)(`table`,{className:`comments-print-table w-full table-fixed border-collapse border border-neutral-300 dark:border-neutral-600`,children:(0,h.jsx)(`tbody`,{children:(0,h.jsx)(`tr`,{children:(0,h.jsx)(`td`,{className:`px-3 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white text-sm min-h-[80px] align-top whitespace-pre-wrap break-words`,style:{wordBreak:`break-word`,overflowWrap:`anywhere`,maxWidth:`100%`},children:G.comments})})})})})]})]}),!z&&O&&(0,h.jsx)(`div`,{className:`mb-6 print:hidden flex justify-center`,children:(0,h.jsx)(`button`,{onClick:async()=>{if(!(!e||!w?.id))try{await $(),await new Promise(e=>setTimeout(e,500));let t=n||window.location.pathname.split(`/`).pop();if(!t)throw Error(`Failed to save report`);let r=`report:/jobs/${e}/${B}/${t}`,{error:i}=await p.schema(`neta_ops`).from(`assets`).update({status:`ready_for_review`,submitted_at:new Date().toISOString()}).eq(`file_url`,r);if(i)throw i;alert(`Report marked as ready for review!`)}catch(e){console.error(`Error marking report as ready:`,e),alert(`Failed to mark as ready: ${e?.message||`Unknown error`}`)}},className:`px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`,children:`Mark Ready to Review`})})]})};if(typeof document<`u`){let e=document.createElement(`style`);e.textContent=`
    /* Visible scrollbar for turns ratio table on screen */
    @media screen {
      /* On-screen test equipment: ensure values are readable (print layout unchanged) */
      .test-eqpt-onscreen input,
      .test-eqpt-onscreen input[readonly],
      .test-eqpt-onscreen .form-input {
        color: #111827 !important;
        -webkit-text-fill-color: #111827 !important;
        opacity: 1 !important;
      }
      html.dark .test-eqpt-onscreen input,
      html.dark .test-eqpt-onscreen input[readonly],
      html.dark .test-eqpt-onscreen .form-input {
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
      }

      .turns-ratio-scroll {
        overflow-x: scroll !important; /* Force scrollbar to always show */
        scrollbar-gutter: stable; /* Reserve space for scrollbar */
        -webkit-overflow-scrolling: touch;
      }

      .turns-ratio-scroll::-webkit-scrollbar {
        height: 14px;
        background-color: #e5e7eb;
        -webkit-appearance: none;
        display: block !important; /* Force display */
      }

      .turns-ratio-scroll::-webkit-scrollbar:horizontal {
        display: block !important; /* Ensure horizontal scrollbar always shows */
      }

      .turns-ratio-scroll::-webkit-scrollbar-track {
        background-color: #f3f4f6;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        display: block !important;
      }

      .turns-ratio-scroll::-webkit-scrollbar-thumb {
        background-color: #f26722;
        border-radius: 8px;
        border: 2px solid #f3f4f6;
        min-width: 50px; /* Ensure thumb is always grabbable */
        display: block !important;
      }

      .turns-ratio-scroll::-webkit-scrollbar-thumb:hover {
        background-color: #e55611;
      }

      .turns-ratio-scroll::-webkit-scrollbar-thumb:active {
        background-color: #d4501a;
      }

      /* Dark mode scrollbar */
      html.dark .turns-ratio-scroll::-webkit-scrollbar {
        background-color: #1f2937;
      }

      html.dark .turns-ratio-scroll::-webkit-scrollbar-track {
        background-color: #374151;
        border: 1px solid #4b5563;
      }

      html.dark .turns-ratio-scroll::-webkit-scrollbar-thumb {
        background-color: #f26722;
        border: 2px solid #374151;
      }

      /* Firefox - force scrollbar always visible */
      @supports (scrollbar-color: auto) {
        .turns-ratio-scroll {
          scrollbar-color: #f26722 #f3f4f6;
          scrollbar-width: thin;
          overflow-x: scroll !important;
        }

        html.dark .turns-ratio-scroll {
          scrollbar-color: #f26722 #374151;
        }
      }
    }

    @media print {
      * { color: black !important; background: white !important; box-sizing: border-box !important; }
      html, body {
        margin: 0 !important;
        padding: 6px !important;
        min-height: 0 !important;
        height: auto !important;
        font-family: Arial, sans-serif !important;
        font-size: 9px !important;
      }

      /* Single-page layout: compact all report sections */
      #report-container:has(.two-small-xfmr-mts-print-root) {
        padding: 0 !important;
        max-width: 100% !important;
      }
      .two-small-xfmr-mts-print-root {
        font-size: 8px !important;
        line-height: 1.1 !important;
      }
      .two-small-xfmr-mts-print-root section {
        margin-bottom: 10px !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        page-break-before: auto !important;
        page-break-after: auto !important;
      }
      .two-small-xfmr-mts-print-root .report-section-divider {
        display: block !important;
        background-color: #f26722 !important;
        height: 3px !important;
        min-height: 3px !important;
        margin-bottom: 6px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .two-small-xfmr-mts-print-root .report-section-heading,
      .two-small-xfmr-mts-print-root section > h2 {
        font-size: 9px !important;
        margin-bottom: 6px !important;
        margin-top: 0 !important;
        padding-bottom: 2px !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content {
        margin-top: 0 !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content + .report-section-content {
        margin-top: 8px !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content.space-y-3 > * + * {
        margin-top: 8px !important;
      }
      .two-small-xfmr-mts-print-root table {
        font-size: 7px !important;
        margin: 0 0 2px 0 !important;
      }
      .two-small-xfmr-mts-print-root th,
      .two-small-xfmr-mts-print-root td {
        padding: 1px 2px !important;
        font-size: 7px !important;
        line-height: 1.1 !important;
      }
      .two-small-xfmr-mts-print-root table input,
      .two-small-xfmr-mts-print-root table select {
        font-size: 7px !important;
        min-height: 0 !important;
        height: auto !important;
        padding: 0 1px !important;
        border: none !important;
        background: transparent !important;
      }
      .two-small-xfmr-mts-print-root .nameplate-table .text-sm,
      .two-small-xfmr-mts-print-root .nameplate-table div {
        font-size: 7px !important;
        margin-top: 0 !important;
      }
      .two-small-xfmr-mts-print-root .turns-ratio-secondary-label {
        margin-bottom: 6px !important;
        font-size: 7px !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content.overflow-x-auto,
      .two-small-xfmr-mts-print-root .report-section-content.turns-ratio-scroll {
        margin-bottom: 0 !important;
        overflow: visible !important;
      }
      .two-small-xfmr-mts-print-root .report-section-content.space-y-3 > * + * {
        margin-top: 8px !important;
      }

      .min-h-screen, .screen-min-height, .pb-20 {
        min-height: 0 !important;
        height: auto !important;
        padding-bottom: 0 !important;
      }

      /* Remove padding on main content wrapper to prevent blank page */
      .p-6 { padding: 0 !important; }
      .flex.justify-center { justify-content: flex-start !important; }
      .max-w-7xl { max-width: 100% !important; }
      .space-y-6 > * + * { margin-top: 4px !important; }
      .two-small-xfmr-mts-print-root .space-y-6 > * + * { margin-top: 0 !important; }

      /* Ensure print header doesn't cause page break */
      .print-report-header,
      .print\\:flex.hidden {
        display: flex !important;
        padding-bottom: 6px !important;
        margin-bottom: 14px !important;
        page-break-after: avoid !important;
      }

      /* Remove shadows only; keep borders for structure */
      .shadow, .shadow-md, .shadow-lg { box-shadow: none !important; }

      /* Section headers */
      section > h2,
      .report-section-heading {
        border-bottom: 1px solid black !important;
        padding-bottom: 2px !important;
        margin-bottom: 0.75rem !important;
        font-weight: bold !important;
      }
      .report-section-divider {
        background-color: #f26722 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .report-section-content + .report-section-content {
        margin-top: 0.75rem !important;
      }
      .report-section-content.space-y-3 > * + * {
        margin-top: 0.75rem !important;
      }

      /* Ensure Tailwind print:flex headers render in print */
      .print\\:flex { display: flex !important; }
      .print\\:block { display: block !important; }
      .print\\:hidden { display: none !important; }

      /* Hide Back to Job button and division headers specifically */
      button[class*="Back"],
      *[class*="Back to Job"],
      h2[class*="Division"],
      .mobile-nav-text,
      [class*="formatDivisionName"] {
        display: none !important;
      }

      /* Form elements - ensure text shows in boxes (exclude radios/checkboxes) */
      input:not([type="radio"]):not([type="checkbox"]), select, textarea {
        background-color: white !important;
        border: 1px solid black !important;
        color: black !important;
        padding: 3px 4px !important;
        font-size: 12px !important;
        font-family: Arial, sans-serif !important;
        min-height: 18px !important;
        line-height: 1 !important;
        vertical-align: top !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Ensure text values are visible in form elements */
      input[type="text"], input[type="number"], input[type="date"],
      select, textarea {
        background: white !important;
        color: black !important;
        border: 1px solid black !important;
        font-weight: normal !important;
        text-align: left !important;
        min-width: 60px !important;
        vertical-align: top !important;
      }

      /* Center-aligned inputs stay centered */
      input.text-center, select.text-center {
        text-align: center !important;
        vertical-align: top !important;
      }

      /* Ensure table center-aligned inputs are properly aligned */
      table input.text-center, table select.text-center {
        text-align: center !important;
        vertical-align: top !important;
        padding: 1px 3px !important;
        width: 95% !important;
        max-width: 95% !important;
      }

      /* Hide dropdown arrows and form control indicators */
      select {
        background-image: none !important;
        padding-right: 8px !important;
      }

      /* Hide spin buttons on number inputs */
      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      input[type="number"] {
        -moz-appearance: textfield !important;
      }

      /* Use native radio look for print to match on-screen (and ATS output) */
      input[type="radio"] {
        -webkit-appearance: radio !important;
        -moz-appearance: radio !important;
        appearance: auto !important;
        background: initial !important;
        border: initial !important;
        width: 16px !important;
        height: 16px !important;
        margin-right: 6px !important;
      }
      input[type="radio"]:checked::after { content: none !important; }

      /* Table styling */
      table {
        border-collapse: collapse;
        width: 100%;
        font-size: 12px !important;
        page-break-inside: auto;
      }
      th, td {
        border: 1px solid black !important;
        padding: 3px !important;
        page-break-inside: auto;
        min-height: 0 !important;
        vertical-align: top !important;
      }
      th {
        background-color: #f0f0f0 !important;
        font-weight: bold !important;
        font-size: 12px !important;
        text-align: center !important;
      }

      /* Table inputs need proper sizing */
      table input, table select {
        width: 95% !important;
        max-width: 95% !important;
        min-width: 0 !important;
        height: auto !important;
        min-height: 0 !important;
        padding: 1px 2px !important;
        font-size: 7px !important;
        margin: 0 !important;
        line-height: 1 !important;
        vertical-align: top !important;
        box-sizing: border-box !important;
        border: 1px solid black !important;
      }

      /* Remove conflicting width classes in print */
      table input.w-16, table input.w-20, table input.w-24,
      table input.w-full, table input.w-32 {
        width: 95% !important;
        max-width: 95% !important;
      }

      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }

      /* Section styling */
      section {
        page-break-inside: auto !important;
        margin-bottom: 4px !important;
      }
      .two-small-xfmr-mts-print-root section {
        margin-bottom: 10px !important;
      }

      /* Page break utilities */
      .print\\:break-before-page { page-break-before: always; }
      .print\\:break-after-page { page-break-after: always; }
      .print\\:break-inside-avoid { page-break-inside: avoid; }
      .print\\:text-black { color: black !important; }
      .print\\:bg-white { background-color: white !important; }
      .print\\:border-black { border-color: black !important; }
      .print\\:font-bold { font-weight: bold !important; }
      .print\\:text-center { text-align: center !important; }

      /* Improve table borders and spacing */
      .table-border {
        border: 1px solid black !important;
      }

      /* Turns Ratio table - match other tables styling */
      .turns-ratio-scroll {
        overflow: visible !important;
        width: 100% !important;
        max-width: 100% !important;
      }

      table.turns-ratio-setup-table,
      table.turns-ratio-results-table {
        width: 100% !important;
        min-width: auto !important;
        max-width: 100% !important;
        table-layout: fixed !important;
        margin: 0 0 2px 0 !important;
        border-collapse: collapse !important;
        transform: none !important;
        font-size: 7px !important;
      }
      table.turns-ratio-setup-table th,
      table.turns-ratio-setup-table td {
        width: 33.3333% !important;
        min-width: 33.3333% !important;
        max-width: 33.3333% !important;
      }
      .two-small-xfmr-mts-print-root table.turns-ratio-setup-table,
      .two-small-xfmr-mts-print-root table.turns-ratio-results-table {
        font-size: 7px !important;
        margin: 0 !important;
      }

      table.turns-ratio-setup-table input,
      table.turns-ratio-setup-table select,
      table.turns-ratio-results-table input,
      table.turns-ratio-results-table select {
        font-size: 7px !important;
        padding: 1px 2px !important;
        width: 88% !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
        border: none !important;
        background: transparent !important;
        text-align: center !important;
      }

      table.turns-ratio-setup-table td,
      table.turns-ratio-results-table td {
        padding: 2px !important;
        font-size: 7px !important;
        overflow: hidden !important;
        text-overflow: clip !important;
        white-space: normal !important;
        word-break: break-word !important;
        border: 1px solid black !important;
        text-align: center !important;
        vertical-align: middle !important;
      }

      table.turns-ratio-setup-table th,
      table.turns-ratio-results-table th {
        background-color: #f3f4f6 !important;
        white-space: normal !important;
        word-break: break-word !important;
        line-height: 1.1 !important;
        font-size: 7px !important;
        padding: 2px !important;
        text-align: center !important;
        font-weight: bold !important;
        border: 1px solid black !important;
        vertical-align: middle !important;
      }

      /* Test Equipment Table - better spacing for print */
      .test-equipment-table {
        margin-top: 2px !important;
        margin-bottom: 2px !important;
        width: 100% !important;
      }

      .test-equipment-table th {
        background-color: #f3f4f6 !important;
        font-size: 7px !important;
        padding: 2px 4px !important;
        text-align: left !important;
        font-weight: bold !important;
        border: 1px solid black !important;
      }

      .test-equipment-table td {
        font-size: 7px !important;
        padding: 2px 4px !important;
        text-align: left !important;
        border: 1px solid black !important;
        vertical-align: middle !important;
      }
      .two-small-xfmr-mts-print-root .test-equipment-table td,
      .two-small-xfmr-mts-print-root .test-equipment-table td div {
        font-size: 7px !important;
        line-height: 1.1 !important;
      }

      .test-equipment-table td.font-medium {
        font-weight: 600 !important;
      }

      /* Better page break handling */
      .bg-white, .dark\\:bg-dark-150 {
        background-color: white !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }

      /* Ensure proper spacing */
      .space-y-6 > * + * {
        margin-top: 1.5rem !important;
      }

      /* Grid layouts for print */
      .grid {
        display: grid !important;
      }

      /* Flex layouts for print */
      .flex {
        display: flex !important;
      }

      /* Visual & Mechanical table widths for readability */
      table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
      table.visual-mechanical-table thead { display: table-header-group !important; }
      table.visual-mechanical-table tr { page-break-inside: auto !important; break-inside: auto !important; }
      table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 7px !important; padding: 1px 2px !important; vertical-align: middle !important; }
      /* Center header text for ID/DESCRIPTION/etc */
      table.visual-mechanical-table th { text-align: center !important; }
      table.visual-mechanical-table td { text-align: center !important; }
      table.visual-mechanical-table td:nth-child(2) { text-align: center !important; }
      table.visual-mechanical-table colgroup col:nth-child(1) { width: 6% !important; }
      table.visual-mechanical-table colgroup col:nth-child(2) { width: 70% !important; }
      table.visual-mechanical-table colgroup col:nth-child(3) { width: 24% !important; }
      table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }

      /* Insulation resistance table - fit within page width */
      table.insulation-resistance-table {
        table-layout: fixed !important;
        width: 100% !important;
        max-width: 100% !important;
        font-size: 9px !important;
      }
      table.insulation-resistance-table th,
      table.insulation-resistance-table td {
        padding: 1px 2px !important;
        font-size: 7px !important;
        white-space: normal !important;
        word-break: break-word !important;
        line-height: 1.1 !important;
      }
      table.insulation-resistance-table input,
      table.insulation-resistance-table select {
        font-size: 7px !important;
        padding: 1px 2px !important;
        min-width: 0 !important;
        width: 100% !important;
      }

      /* Dielectric Absorption table - make first column wider for "Calculated As:" text */
      table.dielectric-absorption-table { table-layout: fixed !important; width: 100% !important; font-size: 7px !important; }
      table.dielectric-absorption-table th,
      table.dielectric-absorption-table td {
        padding: 1px 2px !important;
        font-size: 7px !important;
      }
      table.dielectric-absorption-table td:first-child { width: 50% !important; min-width: 50% !important; max-width: 50% !important; }
      table.dielectric-absorption-table td:not(:first-child) { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }
      table.dielectric-absorption-table th:first-child { width: 50% !important; min-width: 50% !important; max-width: 50% !important; }
      table.dielectric-absorption-table th:not(:first-child) { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }

      /* Alternative approach for browsers that don't support :has() */
      table:not(.turns-ratio-setup-table):not(.turns-ratio-results-table):not(.visual-mechanical-table):not(.dielectric-absorption-table):not(.job-info-print-table):not(.comments-print-table) { table-layout: fixed !important; width: 100% !important; }
      table:not(.turns-ratio-setup-table):not(.turns-ratio-results-table):not(.visual-mechanical-table):not(.dielectric-absorption-table):not(.job-info-print-table):not(.comments-print-table) td:first-child { width: 35% !important; }
      table:not(.turns-ratio-setup-table):not(.turns-ratio-results-table):not(.visual-mechanical-table):not(.dielectric-absorption-table):not(.job-info-print-table):not(.comments-print-table) td:not(:first-child) { width: 13% !important; }

      /* Comments tables: full width with text wrap for long content */
      table.comments-print-table { table-layout: fixed !important; width: 100% !important; max-width: 100% !important; }
      table.comments-print-table td {
        width: 100% !important;
        max-width: 100% !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        word-wrap: break-word !important;
        text-align: left !important;
        overflow: visible !important;
        text-overflow: clip !important;
      }

      /* Job Information table - force 6 equal columns and wrap text normally */
      table.job-info-print-table { table-layout: fixed !important; width: 100% !important; }
      table.job-info-print-table td { width: 16.6667% !important; min-width: 0 !important; max-width: 16.6667% !important; white-space: normal !important; overflow-wrap: break-word !important; word-break: normal !important; }

      /* Center header text for IR and corrected tables (A-G, etc.) */
      .ir-table th, .ir-corrected-table th { text-align: center !important; }
      .ir-table td, .ir-corrected-table td { text-align: center !important; }
      /* Center header text for contact resistance table */
      .contact-resistance-table th { text-align: center !important; }
      .contact-resistance-table td { text-align: center !important; }

      /* Center content in Nameplate tables */
      .nameplate-table th, .nameplate-table td, .nameplate-table div { text-align: center !important; }

      /* Hide on-screen grids in print to avoid duplication */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .nameplate-onscreen, .nameplate-onscreen * { display: none !important; }

      /* Ensure print-only tables are visible */
      .hidden.print\\:block { display: block !important; }
      .hidden.print\\:block * { display: revert !important; }

      /* Nameplate Basic Info table - ensure equal column widths */
      table:has(colgroup col[style*="33.33%"]) { table-layout: fixed !important; width: 100% !important; }
      table:has(colgroup col[style*="33.33%"]) td { width: 33.33% !important; min-width: 33.33% !important; max-width: 33.33% !important; }

      /* Nameplate Details table - optimize column widths */
      table:has(colgroup col[style*="12%"]) { table-layout: fixed !important; width: 100% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(1) { width: 12% !important; min-width: 12% !important; max-width: 12% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(2) { width: 18% !important; min-width: 18% !important; max-width: 18% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(3) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(4) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(5) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(6) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(7) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }

      /* PASS/FAIL status styles */
      .pass-fail-status-box {
        display: inline-block !important;
        padding: 4px 10px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-align: center !important;
        width: fit-content !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
        min-width: 60px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color: #fff !important;
        border: 2px solid transparent !important;
        float: right !important; /* ensure it stays on the right under NETA */
      }
      .pass-fail-status-box.pass { background-color: #22c55e !important; border-color: #16a34a !important; }
      .pass-fail-status-box.fail { background-color: #ef4444 !important; border-color: #dc2626 !important; }

      /* Hide interactive buttons in print */
      button { display: none !important; }
    }

    /* Mirror critical print rules for live preview iframe (.force-print) so
       Show Preview accurately reflects final PDF rendering. */
    .force-print .turns-ratio-scroll {
      overflow: visible !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    .force-print table.turns-ratio-setup-table,
    .force-print table.turns-ratio-results-table {
      width: 100% !important;
      min-width: auto !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      margin: 4px 0 !important;
      border-collapse: collapse !important;
      transform: none !important;
      font-size: 9px !important;
    }
    .force-print table.turns-ratio-setup-table th,
    .force-print table.turns-ratio-setup-table td {
      width: 33.3333% !important;
      min-width: 33.3333% !important;
      max-width: 33.3333% !important;
    }
    .force-print table.turns-ratio-setup-table input,
    .force-print table.turns-ratio-setup-table select,
    .force-print table.turns-ratio-results-table input,
    .force-print table.turns-ratio-results-table select {
      font-size: 9px !important;
      padding: 4px 2px !important;
      width: 100% !important;
      box-sizing: border-box !important;
      border: none !important;
      background: transparent !important;
      text-align: center !important;
    }
    .force-print table.turns-ratio-setup-table td,
    .force-print table.turns-ratio-results-table td {
      padding: 4px 2px !important;
      font-size: 9px !important;
      border: 1px solid black !important;
      text-align: center !important;
      vertical-align: middle !important;
    }
    .force-print table.turns-ratio-setup-table th,
    .force-print table.turns-ratio-results-table th {
      background-color: #f3f4f6 !important;
      font-size: 9px !important;
      padding: 4px 2px !important;
      text-align: center !important;
      font-weight: bold !important;
      border: 1px solid black !important;
      vertical-align: middle !important;
    }

    /* Mirror Test Equipment table spacing */
    .force-print .test-equipment-table { width: 100% !important; margin: 10px 0 20px 0 !important; }
    .force-print .test-equipment-table th {
      background-color: #f3f4f6 !important;
      font-size: 10px !important;
      padding: 8px 12px !important;
      text-align: left !important;
      font-weight: bold !important;
      border: 1px solid black !important;
    }
    .force-print .test-equipment-table td {
      font-size: 10px !important;
      padding: 8px 12px !important;
      text-align: left !important;
      border: 1px solid black !important;
      vertical-align: middle !important;
    }
  `,document.head.appendChild(e)}export{C as default};