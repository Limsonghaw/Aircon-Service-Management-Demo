import { useResource } from './useResource'
import { getTeams, type Team } from '../services/teamsApi'

export function useTeams(enabled = true) {
  const state = useResource(getTeams, [] as Team[], enabled)
  return { ...state, teams: state.data }
}
