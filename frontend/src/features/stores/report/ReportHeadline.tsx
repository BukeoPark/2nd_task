import { useLayoutEffect, useRef } from "react";

/** 쉼표 앞의 지역·업종과 뒤의 결론을 분리한다. 결론만 실제 너비에 맞춘다. */
export function ReportHeadline({ title }: { title: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const comma = title.indexOf(",");
  const context = comma < 0 ? title : title.slice(0, comma + 1);
  const conclusion = comma < 0 ? null : title.slice(comma + 1).trim();
  useLayoutEffect(() => {
    const heading = ref.current;
    const line = lineRef.current;
    if (!heading || !line) return;
    let active = true;
    let previousWidth = -1;
    const fit = () => {
      if (!active || heading.clientWidth === 0) return;
      line.style.fontSize = "1em";
      const available = heading.clientWidth;
      const needed = line.scrollWidth;
      if (needed > available) line.style.fontSize = `${available / needed * 0.99}em`;
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (heading.clientWidth !== previousWidth) {
        previousWidth = heading.clientWidth;
        fit();
      }
    });
    observer.observe(heading);
    void document.fonts.ready.then(fit);
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", fit);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", fit);
    };
  }, [title]);
  return <h1 ref={ref} className="irp-headline" style={{fontSize:"clamp(26px,5vw,38px)",lineHeight:1.25,fontWeight:900,margin:0,letterSpacing:"-.02em"}}>
    <span style={{display:"block"}}>{context}</span>
    {conclusion && <span ref={lineRef} style={{display:"block",whiteSpace:"nowrap",marginTop:".12em"}}>{conclusion}</span>}
  </h1>;
}
