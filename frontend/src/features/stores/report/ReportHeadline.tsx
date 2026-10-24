import { ReportFitLine } from "./ReportFitLine";

/** 첫 줄은 지역·업종, 둘째 줄은 인사이트. 각 줄은 줄바꿈 없이 폭에 맞춘다. */
export function ReportHeadline({ title }: { title: string }) {
  const comma=title.indexOf(",");
  const context=comma<0?title:title.slice(0,comma+1);
  const conclusion=comma<0?null:title.slice(comma+1).trim();
  return <h1 className="irp-headline" style={{fontSize:"clamp(26px,5vw,38px)",lineHeight:1.25,fontWeight:900,margin:0,letterSpacing:"-.02em"}}>
    <ReportFitLine>{context}</ReportFitLine>
    {conclusion&&<span style={{display:"block",marginTop:".12em"}}><ReportFitLine>{conclusion}</ReportFitLine></span>}
  </h1>;
}
