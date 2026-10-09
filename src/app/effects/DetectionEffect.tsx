import { useEffect } from 'react'
import { selectImageDescriptors, useImages } from '../../features/images'
import { appDetections } from '../detections'

export function DetectionEffect(): null {
  const images = useImages(selectImageDescriptors)
  useEffect(() => {
    appDetections.sync(images)
  }, [images])
  return null
}
