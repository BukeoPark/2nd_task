import { useLayoutEffect, useRef, type ReactNode } from "react";

export function ReportFitLine({ children }: { children: ReactNode }) {
  const ref=useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{
    const el=ref.current;
    if(!el) return;
    const fit=()=>{el.style.fontSize="1em";if(el.clientWidth>0 && el.scrollWidth>el.clientWidth) el.style.fontSize=`${el.clientWidth/el.scrollWidth*0.99}em`;};
    fit();const observer=new ResizeObserver(fit);observer.observe(el);
    document.fonts.ready.then(fit);
    window.addEventListener("beforeprint",fit);window.addEventListener("afterprint",fit);
    return()=>{observer.disconnect();window.removeEventListener("beforeprint",fit);window.removeEventListener("afterprint",fit);};
  },[children]);
  return <span ref={ref} style={{display:"block",minWidth:0,whiteSpace:"nowrap"}}>{children}</span>;
}
