import { createContext } from "react";

/** 좁은 화면에서 서랍(매장 상세·상권 분석)이 지도를 덮을 때, 서랍을 잠깐 접고 지도를 보는 동작. 값이 없으면(넓은 화면) 단추를 내지 않는다. */
export const MapPeekContext = createContext<(() => void) | null>(null);
