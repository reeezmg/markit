import ExcelJS from 'exceljs';
import {setHeader,getQuery} from 'h3';
import {reportWindow,reportNumber} from './report-accounting';
export async function gstExcel(event:any,data:any,name:string){
 const {from,to}=reportWindow(getQuery(event)),book=new ExcelJS.Workbook();
 const summary=book.addWorksheet('Summary');summary.addRow([name.toUpperCase()+' source report']);summary.addRow(['From',from.toISOString(),'To',to.toISOString()]);
 summary.addRow(['Basis','Source invoices and purchases; accounting comparison is separate']);
 for(const [section,value] of Object.entries(data)){if(section==='accounting'||Array.isArray(value)||!value||typeof value!=='object')continue;for(const [key,amount] of Object.entries(value))summary.addRow([section+' / '+key,amount]);}
 for(const [name,values] of Object.entries(data)){if(!Array.isArray(values))continue;const sheet=book.addWorksheet(name.slice(0,31));if(!values.length)continue;const keys=Object.keys(values[0]);sheet.addRow(keys.map(k=>k.replace(/([A-Z])/g,' $1')));for(const row of values)sheet.addRow(keys.map(k=>row[k]));}
 const recon=book.addWorksheet('Accounting comparison');recon.addRow(['Tax','Source documents','Posted accounting movement','Accounting less source']);
 const output=data.kpi?.totalTax??data.outwardTaxable?.totalTax,input=data.kpi?.totalItc??data.itc?.totalItc;
 if(output!==undefined)recon.addRow(['Output tax',output,data.accounting.outputTax,reportNumber(data.accounting.outputTax-output)]);
 if(input!==undefined)recon.addRow(['Input tax',input,data.accounting.inputTax,reportNumber(data.accounting.inputTax-input)]);
 recon.addRow(['Posted input includes recoverable expense tax and journal adjustments. Source reports do not establish recovery eligibility.']);
 for(const sheet of book.worksheets){sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>{c.width=24})}
 setHeader(event,'Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');setHeader(event,'Content-Disposition',`attachment; filename="${name}.xlsx"`);return book.xlsx.writeBuffer();
}
