import { WebContents, ipcMain, ipcRenderer } from 'electron';
import { Middleware, MiddlewareAPI, Dispatch, AnyAction } from 'redux';

import { isFSA, FluxStandardAction } from './structs/fsa';

export const EVENT_WEB_CONTENTS_FOCUS_CHANGED = 'event/web-contents-focus-changed';
export const EVENT_BROWSER_VIEW_ATTACHED = 'event/browser-view-attached';

enum ReduxIpcChannel {
	GET_INITIAL_STATE = 'redux/get-initial-state',
	ACTION_DISPATCHED = 'redux/action-dispatched',
}

enum ActionScope {
	LOCAL = 'local',
}

export const forwardToRenderers: Middleware = (api: MiddlewareAPI) => {
	const renderers = new Set<WebContents>();

	ipcMain.handle(ReduxIpcChannel.GET_INITIAL_STATE, (event) => {
		const webContents = event.sender;

		renderers.add(webContents);

		webContents.addListener('destroyed', () => {
			renderers.delete(webContents);
		});

		return api.getState();
	});

	ipcMain.addListener(ReduxIpcChannel.ACTION_DISPATCHED, (_event, action) => {
		api.dispatch(action);
	});

	return (next: Dispatch) => (action: AnyAction) => {
		if (!isFSA(action)) {
			return next(action);
		}

		if (action.meta && action.meta.scope === ActionScope.LOCAL) {
			return next(action);
		}

		const rendererAction: FluxStandardAction<unknown> = {
			...action,
			meta: {
				...action.meta,
				scope: ActionScope.LOCAL,
			},
		};

		renderers.forEach((webContents) => {
			webContents.send(ReduxIpcChannel.ACTION_DISPATCHED, rendererAction);
		});

		return next(action);
	};
};

export const getInitialState = (): Promise<any> =>
	ipcRenderer.invoke(ReduxIpcChannel.GET_INITIAL_STATE);

export const forwardToMain: Middleware = (api: MiddlewareAPI) => {
	ipcRenderer.addListener(ReduxIpcChannel.ACTION_DISPATCHED, (_event, action) => {
		api.dispatch(action);
	});

	return (next: Dispatch) => (action: AnyAction) => {
		if (!isFSA(action)) {
			return next(action);
		}

		if (action.meta && action.meta.scope === ActionScope.LOCAL) {
			return next(action);
		}

		ipcRenderer.send(ReduxIpcChannel.ACTION_DISPATCHED, action);
	};
};