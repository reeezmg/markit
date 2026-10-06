import {defineEventHandler,getQuery,setHeader} from 'h3';
import {pool} from '~/server/db';
import {getReadCompanyIds} from '~/server/utils/organizationReadScope';
import {accountingReport,reportWindow} from '~/server/utils/report-accounting';
import {jsPDF} from 'jspdf';
export default defineEventHandler(async event=>{
 const ids=await getReadCompanyIds(event),{from,to}=reportWindow(getQuery(event));
 const report=await accountingReport(pool,ids,from,to),p=report.pnl;
 const doc=new jsPDF();doc.setFontSize(18);doc.text('Profit and Loss',20,22);doc.setFontSize(10);
 doc.text(`Posted accounting | ${report.currency} | ${from.toISOString().slice(0,10)} to ${to.toISOString().slice(0,10)}`,20,32);
 doc.text('Only posted entries are included. Unimported source history is excluded.',20,40);
 let y=55;for(const [label,value] of [['Sales income (excluding tax)',p.totalSales],['Cost of goods sold',p.totalCOGS],['Gross profit',p.totalProfitBeforeExpense],['Other income',p.otherIncome],['Expenses',p.totalExpenses],['Net profit',p.netProfit]]){doc.text(String(label),20,y);doc.text(Number(value).toFixed(2),185,y,{align:'right'});y+=10;}
 setHeader(event,'Content-Type','application/pdf');setHeader(event,'Content-Disposition','attachment; filename="profit-summary.pdf"');return Buffer.from(doc.output('arraybuffer'));
});
