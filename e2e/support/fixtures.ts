import { fileURLToPath } from 'node:url'

const f = (name: string) =>
  fileURLToPath(new URL(`../../src/features/images/__fixtures__/${name}`, import.meta.url))

/** Absolute paths to the image fixtures committed by the images feature (never duplicated here). */
export const FIXTURES = {
  quadrantsJpg: f('quadrants.jpg'),
  quadrantsExif6: f('quadrants-exif6.jpg'),
  quadrantsExif3: f('quadrants-exif3.jpg'),
  quadrantsPng: f('quadrants.png'),
  quadrantsWebp: f('quadrants.webp'),
  transparentPng: f('transparent.png'),
  stillGif: f('still.gif'),
  animatedGif: f('animated.gif'),
  heic: f('photo.heic'),
  mislabelledHeic: f('mislabelled-heic.jpg'),
  notesPdf: f('notes.pdf'),
  valueRamp: f('value-ramp.png'),
  flatGrey: f('flat-grey.png'),
} as const
