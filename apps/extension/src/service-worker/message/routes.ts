/// <reference types="chrome" />

import { MessageEnvelope } from "../../types";
import { getConnectState } from "../connect-state";
import { setEnabledByUser } from "../enabled-by-user/runtime";
import { getPopupState } from "../popup-state";
import { registerPreparedContext, registerPreparedCtx } from "../prepared-context/runtime";
import {
  CTX_MESSAGE_TYPE,
  CONNECT_MESSAGE_TYPE,
  GET_POPUP_STATE_MESSAGE_TYPE,
  PREPARED_MESSAGE_TYPE,
  SET_ENABLED_BY_USER_MESSAGE_TYPE,
} from "./types";

export async function handleMessage({ received, sender }: MessageEnvelope): Promise<any> {
  switch (received?.type) {
    case CONNECT_MESSAGE_TYPE:
      return getConnectState(sender as chrome.runtime.MessageSender);
    case CTX_MESSAGE_TYPE:
      return registerPreparedCtx(
        received,
        sender as chrome.runtime.MessageSender,
      );
    case GET_POPUP_STATE_MESSAGE_TYPE:
      return getPopupState(received);
    case SET_ENABLED_BY_USER_MESSAGE_TYPE:
      return setEnabledByUser(received);
    case PREPARED_MESSAGE_TYPE:
      return registerPreparedContext(
        received,
        sender as chrome.runtime.MessageSender,
      );
    default:
      return { ok: false, error: `Unknown type "${String(received?.type)}"` };
  }
}
