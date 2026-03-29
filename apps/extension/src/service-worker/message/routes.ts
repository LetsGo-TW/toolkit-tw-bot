/// <reference types="chrome" />

import { MessageEnvelope } from "../../types";
import { getConnectState } from "../connect-state";
import { setEnabledByUser } from "../enabled-by-user/runtime";
import { getPopupState } from "../popup-state";
import { registerPreparedContext } from "../prepared-context/runtime";
import {
  CONNECT_MESSAGE_TYPE,
  GET_POPUP_STATE_MESSAGE_TYPE,
  PREPARED_MESSAGE_TYPE,
  SET_ENABLED_BY_USER_MESSAGE_TYPE,
} from "./types";

export async function handleMessage({ received, sender }: MessageEnvelope): Promise<any> {
  switch (received?.type) {
    case CONNECT_MESSAGE_TYPE:
      return getConnectState(sender as chrome.runtime.MessageSender);
    case GET_POPUP_STATE_MESSAGE_TYPE:
      return getPopupState(received);
    case SET_ENABLED_BY_USER_MESSAGE_TYPE:
      return setEnabledByUser(received);
    case PREPARED_MESSAGE_TYPE:
      return registerPreparedContext(
        received,
        sender as chrome.runtime.MessageSender,
      );
    case "GAME":
      return { ok: true, message: "Not implements GAME!"};
    case "LOGIN":
      return { ok: true, message: "Not implements LOGIN!"};
    default:
      return { ok: false, error: `Unknown type "${String(received?.type)}"` };
  }
}
