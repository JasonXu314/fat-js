const RF = Symbol.for('RENDER_FRAGMENT'),
	ST = Symbol.for('STATE');

class ListenerTable {
	constructor() {
		/** @type {Map<HTMLElement, (() => void)[]>} */
		this.map = new Map();
	}

	/**
	 * @param {HTMLElement} elem
	 * @param {() => void)} unwatcher
	 */
	set(elem, unwatcher) {
		if (this.map.has(elem)) {
			this.map.set(elem, this.map.get(elem).concat(unwatcher));
		} else {
			this.map.set(elem, [unwatcher]);
		}
	}

	/** @param {HTMLElement} elem */
	clean(elem) {
		const unwatchers = this.map.get(elem);

		if (unwatchers) {
			unwatchers.forEach((cleaner) => cleaner());
		}

		this.map.delete(elem);
	}
}

const GLT = new ListenerTable();

class RenderFragment {
	/** @param {HTMLElement[]} elems */
	constructor(elems) {
		this.elems = elems;
		this[RF] = true;
	}

	/**
	 * @param {unknown} other
	 * @returns {other is RenderFragment}
	 */
	static [Symbol.hasInstance](other) {
		return other?.[RF];
	}
}

class Component {
	/** @type {Record<string, ((evt: any) => void)[]} */
	listeners = {};

	/**
	 * @param {string} evt
	 * @param {(evt: any) => void} listener
	 */
	addEventListener(evt, listener) {
		this.listeners[evt] = (this.listeners[evt] ?? []).concat(listener);
	}

	/** @return {RenderFragment}  */
	render() {
		return $html``;
	}

	/**
	 * @param {string} evt
	 * @param {any} data
	 */
	emit(evt, data) {
		(this.listeners[evt] ?? []).forEach((listener) => listener(data));
	}

	/**
	 * @param {new (...args: unknown[])} cls
	 * @returns {cls is new () => Component}
	 */
	static isComponent(cls) {
		const proto = Object.getPrototypeOf(cls);

		return proto !== Function.prototype && (proto === Component || this.isComponent(proto));
	}
}

/** @template T */
class State {
	/** @param {T} init */
	constructor(init) {
		/** @type {T} */
		this.value = init;
		/** @type {((val: T) => void)[]} */
		this.watchers = [];
		this[ST] = true;
	}

	/** @param {T | (prev: T) => T} val */
	set(val) {
		if (typeof val === 'function') {
			this.value = val(this.value);
			this.watchers.forEach((cb) => cb(this.value));
		} else {
			this.value = val;
			this.watchers.forEach((cb) => cb(this.value));
		}
	}

	/** @param {(val: T) => void} watcher */
	watch(watcher) {
		this.watchers.push(watcher);

		return () => (this.watchers = this.watchers.filter((w) => w !== watcher));
	}

	/**
	 * @param {unknown} other
	 * @returns {other is State}
	 */
	static [Symbol.hasInstance](other) {
		return other?.[ST];
	}
}

/** @type {string} */
function ruid() {
	const bits = crypto.getRandomValues(new Uint8Array(16));
	const uid = Array.from(bits)
		.map((n) => n.toString(16))
		.join('');

	return uid;
}

/** @typedef {{ listeners: Record<string, any[]> }} Bindings */

/**
 * @param {Record<string, any>} props
 * @returns {Bindings}
 */
function extractBindings(props) {
	/** @type {Bindings} */
	const bindings = {
		listeners: {}
	};

	let results;
	for (const name in props) {
		if ((results = /on:(.*)/.exec(name))) {
			const evt = results[1];

			bindings.listeners[evt] = (bindings.listeners[evt] ?? []).concat(props[name]);
			delete props[name];
		}
	}

	return bindings;
}

/**
 * @param {Bindings} bindings
 * @param {HTMLElement | Component} elem
 */
function $apply(bindings, elem) {
	for (const evt in bindings.listeners) {
		for (const listener of bindings.listeners[evt]) {
			elem.addEventListener(evt, listener);
		}
	}
}

/**
 * @param {new () => Component} Cmp
 * @param {HTMLElement} target
 * @param {Record<string, any>} props
 */
function $mount(Cmp, target, props) {
	const component = new Cmp();

	const bindings = extractBindings(props);

	$apply(bindings, component);
	target.replaceWith(...component.render(props));
}

/** @param {HTMLElement} target */
function $unmount(target) {
	GLT.clean(target);
	target.remove();

	Array.from(target.childNodes).forEach((child) => $unmount(child));
}

/**
 * @param {string} html
 * @returns {{ key: string, idx: number }}
 */
function extractKeyPos(html) {
	let idx = html.length - 2,
		key = '';

	while (html[idx] !== ' ') {
		key = html[idx] + key;
		idx--;
	}

	return { key, idx };
}

/**
 * @param {string[]} parts
 * @param  {...(RenderFragment | string)} fragments
 * @returns {RenderFragment}
 */
function $html(parts, ...fragments) {
	if (fragments.length === 0) {
		const auxDiv = document.createElement('div');
		auxDiv.innerHTML = parts[0];

		return new RenderFragment(Array.from(auxDiv.childNodes));
	}

	/** @type {Map<string, RenderFragment>} */
	const fragMap = new Map(),
		/** @type {Map<string, Function>} */
		specialFrags = new Map(),
		/** @type {Map<string, Function>} */
		componentFrags = new Map(),
		/** @type {Map<string, State>} */
		stateFrags = new Map();

	const html = parts.slice(1).reduce((html, cur, i) => {
		const frag = fragments[i];

		if (typeof frag === 'string') {
			return html + frag + cur;
		} else if (frag instanceof RenderFragment) {
			const uid = ruid();

			fragMap.set(uid, frag);

			return html + `<div __render-uid="${uid}"></div>` + cur;
		} else if (typeof frag === 'function') {
			if (Component.isComponent(frag)) {
				const entry = Array.from(componentFrags.entries()).find(([, f]) => f === frag);

				if (entry) {
					const [id] = entry;

					return html + 'comp__' + id + cur;
				} else {
					const uid = ruid();

					componentFrags.set(uid, frag);

					return html + 'comp__' + uid + cur;
				}
			} else {
				const uid = ruid();

				specialFrags.set(uid, frag);

				return html + `"${uid}" __special="${uid}"` + cur;
			}
		} else if (frag instanceof State) {
			const entry = Array.from(componentFrags.entries()).find(([, f]) => f === frag);

			if (entry) {
				const [id] = entry;

				if (html.endsWith('=')) {
					const { key, idx } = extractKeyPos(html);

					return html.slice(0, idx + 1) + 'state__' + id + `="${key}"` + cur;
				} else {
					return html + '<state__' + id + '></state__' + id + '>' + cur;
				}
			} else {
				const uid = ruid();

				stateFrags.set(uid, frag);

				if (html.endsWith('=')) {
					const { key, idx } = extractKeyPos(html);

					return html.slice(0, idx + 1) + 'state__' + uid + `="${key}"` + cur;
				} else {
					return html + '<state__' + uid + '></state__' + uid + '>' + cur;
				}
			}
		} else {
			return html + frag + cur;
		}
	}, parts[0]);

	const auxDiv = document.createElement('div');
	auxDiv.innerHTML = html;

	for (const [id, frag] of fragMap.entries()) {
		auxDiv.querySelector(`div[__render-uid="${id}"]`)?.replaceWith(...frag.elems);
	}

	for (const [id, frag] of componentFrags.entries()) {
		const elem = auxDiv.querySelector(`comp__${id}`);

		if (elem) {
			const props = {};

			for (const name of elem.getAttributeNames()) {
				let val = elem.getAttribute(name);

				if (specialFrags.has(val)) {
					val = specialFrags.get(val);
					specialFrags.delete(val);
				}

				props[name] = val;
			}

			$mount(frag, elem, props);
		}
	}

	for (const [id, frag] of specialFrags.entries()) {
		const elem = auxDiv.querySelector(`[__special="${id}"]`);

		if (elem) {
			elem.removeAttribute('__special');

			for (const name of elem.getAttributeNames()) {
				if (elem.getAttribute(name) === id) {
					elem.removeAttribute(name);

					let results;
					if ((results = /on:(.*)/.exec(name))) {
						const evt = results[1];

						elem.addEventListener(evt, frag);
					}
				}
			}
		}
	}

	for (const [id, frag] of stateFrags.entries()) {
		while (true) {
			const attrElem = auxDiv.querySelector(`[state__${id}]`);

			if (attrElem) {
				let attr = attrElem.getAttribute(`state__${id}`);
				attrElem.removeAttribute(`state__${id}`);

				let results;
				if ((results = /bind:(.*)/.exec(attr))) {
					attr = results[1];

					attrElem[attr] = frag.value;
					attrElem.addEventListener('input', (evt) => frag.set(evt.target[attr]));
					GLT.set(
						attrElem,
						frag.watch((val) => (attrElem[attr] = val))
					);
				} else {
					attrElem[attr] = frag.value;
					GLT.set(
						attrElem,
						frag.watch((val) => (attrElem[attr] = val))
					);
				}
			} else {
				const elem = auxDiv.querySelector(`state__${id}`);

				if (elem) {
					const text = document.createTextNode(frag.value);

					elem.replaceWith(text);
					GLT.set(
						text.parentElement,
						frag.watch((val) => (text.textContent = val))
					);
				} else {
					break;
				}
			}
		}
	}

	return new RenderFragment(Array.from(auxDiv.childNodes));
}

/**
 * @param {bool} condition
 * @param {RenderFragment} parent
 */
function $if(condition, parent = null) {
	/** @type {(() => HTMLElement[] | null) | null} */
	let fragResolver = null;

	/**
	 * @param {string[]} parts
	 * @param  {...(RenderFragment | string)} fragments
	 * @returns {RenderFragment}
	 */
	const rootFrag = (parts, ...fragments) => {
		/**
		 * @param {string[]} parts
		 * @param  {...(RenderFragment | string)} fragments
		 * @returns {RenderFragment}
		 */
		const frag = (condition) => $if(condition, frag);

		fragResolver = () => (parent?.elems ?? condition ? $html(parts, ...fragments).elems : null);
		Object.defineProperty(frag, 'elems', { get: () => rootFrag.elems });
		frag[RF] = true;
		frag.parent = rootFrag;

		return frag;
	};
	Object.defineProperty(rootFrag, 'elems', { get: () => (fragResolver ? parent?.elems ?? fragResolver() : parents?.elems ?? null) });

	rootFrag.parent = parent;

	return rootFrag;
}

/**
 * @template T
 * @param {T[] | State<T[]>} list
 * @returns {(fn: (elem: T, i: number) => RenderFragment | string) => RenderFragment}
 */
function $each(list) {
	if (list instanceof State) {
		return (fn) => {
			const children = list.value.map(fn);
			let childElems = children.reduce((elems, c) => elems.concat(...(c instanceof RenderFragment ? c.elems : $html(c).elems)), []);

			list.watch((arr) => {
				childElems.slice(1).forEach((child) => $unmount(child));

				const newChildren = arr.map(fn);
				let newChildElems = newChildren.reduce((elems, c) => elems.concat(...(c instanceof RenderFragment ? c.elems : $html(c).elems)), []);

				if (newChildElems.length === 0) {
					const placeholder = document.createElement('template');

					newChildElems.push(placeholder);
				}

				childElems[0].replaceWith(...newChildElems);
				$unmount(childElems[0]);
				childElems = newChildElems;
			});

			if (childElems.length === 0) {
				const placeholder = document.createElement('template');

				childElems.push(placeholder);
			}

			return new RenderFragment(childElems);
		};
	} else {
		return (fn) => {
			const children = list.map(fn);

			return new RenderFragment(children.reduce((elems, c) => elems.concat(...(c instanceof RenderFragment ? c.elems : $html(c).elems)), []));
		};
	}
}

