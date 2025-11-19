export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export enum Tool {
  PAN = 'PAN',
  ZOOM = 'ZOOM'
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface TextAnnotation {
  box_2d: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  text: string;
  translatedText: string;
}