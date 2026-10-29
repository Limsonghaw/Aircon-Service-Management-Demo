import { useCallback } from 'react'
import { useResource } from './useResource'
import { getDocumentArchives, type ArchiveKind, type DocumentArchive } from '../services/documentArchivesApi'

export function useDocumentArchiveList(kind: ArchiveKind) {
  const load = useCallback(() => getDocumentArchives(kind), [kind])
  return useResource(load, [] as DocumentArchive[])
}
