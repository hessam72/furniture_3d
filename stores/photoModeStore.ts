import { create } from 'zustand'

export type PhotoModeStatus = 'idle' | 'building' | 'rendering'

interface PhotoModeState {
  active: boolean
  status: PhotoModeStatus
  buildProgress: number
  samples: number
  saveRequested: boolean
  setActive: (active: boolean) => void
  setStatus: (status: PhotoModeStatus, buildProgress?: number) => void
  setSamples: (samples: number) => void
  requestSave: () => void
  clearSaveRequest: () => void
}

export const usePhotoMode = create<PhotoModeState>((set) => ({
  active: false,
  status: 'idle',
  buildProgress: 0,
  samples: 0,
  saveRequested: false,
  setActive: (active) => set({ active, ...(active ? {} : { status: 'idle', samples: 0, buildProgress: 0 }) }),
  setStatus: (status, buildProgress = 0) => set({ status, buildProgress }),
  setSamples: (samples) => set({ samples }),
  requestSave: () => set({ saveRequested: true }),
  clearSaveRequest: () => set({ saveRequested: false }),
}))
