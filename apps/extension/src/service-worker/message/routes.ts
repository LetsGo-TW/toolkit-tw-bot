/// <reference types="chrome" />

import { MessageEnvelope } from "../../types";
import { getConnectState } from "../connect-state";
import { setEnabledByUser } from "../enabled-by-user/runtime";
import { handleLogin } from "../login/runtime";
import { getPopupState } from "../popup-state";
import { registerPreparedCtx, syncGameStage, syncSupportCtx } from "../prepared-context/runtime";
import { updatePlayerAvatar } from "../player-avatar/runtime";
import { setReconnectOnSessionExpired } from "../reconnect-on-session-expired/runtime";
import {
  CTX_MESSAGE_TYPE,
  CONNECT_MESSAGE_TYPE,
  GAME_STAGE_MESSAGE_TYPE,
  GET_POPUP_STATE_MESSAGE_TYPE,
  LOGIN_MESSAGE_TYPE,
  SET_ENABLED_BY_USER_MESSAGE_TYPE,
  SET_PLAYER_AVATAR_MESSAGE_TYPE,
  SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE,
  SUPPORT_SYNC_CTX_MESSAGE_TYPE,
  WINDOW_FORCE_FOCUS,
} from "./types";
import { windowForceFocus } from "../window-force-focus";

export async function handleMessage({ received, sender }: MessageEnvelope): Promise<any> {
  switch (received?.type) {
    case CONNECT_MESSAGE_TYPE:
      return getConnectState(sender as chrome.runtime.MessageSender);
    case LOGIN_MESSAGE_TYPE:
      return handleLogin(received, sender as chrome.runtime.MessageSender);
    case CTX_MESSAGE_TYPE:
      return registerPreparedCtx(
        received,
        sender as chrome.runtime.MessageSender,
      );
    case SUPPORT_SYNC_CTX_MESSAGE_TYPE:
      return syncSupportCtx(
        received,
        sender as chrome.runtime.MessageSender,
      );
    case GAME_STAGE_MESSAGE_TYPE:
      return syncGameStage(
        received,
        sender as chrome.runtime.MessageSender,
      );
    case WINDOW_FORCE_FOCUS:
      return windowForceFocus(sender?.tab?.windowId, sender?.tab?.id)
    case GET_POPUP_STATE_MESSAGE_TYPE:
      return getPopupState(received);
    case SET_ENABLED_BY_USER_MESSAGE_TYPE:
      return setEnabledByUser(received);
    case SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE:
      return setReconnectOnSessionExpired(received);
    case SET_PLAYER_AVATAR_MESSAGE_TYPE:
      return updatePlayerAvatar(received, sender as chrome.runtime.MessageSender);
    default:
      return { ok: false, error: `Unknown type "${String(received?.type)}"` };
  }
}
