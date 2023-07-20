function on(event, cb) {
	return new Listener(event, cb);
}

class Component {
	render() {
		throw new Error('Components must implement `render` method.');
	}
}

class Listener {
	constructor(event, cb) {
		this.event = event;
		this.cb = cb;
	}
}

(function () {
	const parser = new DOMParser(),
		serializer = new XMLSerializer();

	let listenerMap = [],
		listenerIdx = 0,
		componentList = [],
		componentIdx = 0,
		renderComponent = null,
		renderStack = [null],
		elemMap = new Map();

	window.html = function html(strings, ...expressions) {
		if (!renderComponent) {
			listenerMap = [];
			listenerIdx = 0;
		}

		let htmlStr = strings[0];
		strings.slice(1).forEach((token, i) => {
			const expr = resolve(expressions[i]);

			if (Array.isArray(expr)) {
				expr.forEach((expr) => {
					if (expr instanceof Listener) {
						listenerMap.push(expr);
						htmlStr += `data-__listener="${listenerIdx++}"`;
					} else {
						htmlStr += expr;
					}
				});
			} else {
				if (expr instanceof Listener) {
					listenerMap.push(expr);
					htmlStr += `data-__listener="${listenerIdx++}"`;
				} else {
					htmlStr += expr;
				}
			}

			htmlStr += token;
		});

		const doc = parser.parseFromString(htmlStr, 'text/html');
		const elems = Array.from(doc.body.children);

		if (renderComponent) {
			elems.forEach((elem) => {
				componentList.push(renderComponent);
				elem.setAttribute('data-__cid', componentIdx++);
			});

			return elems.map((elem) => serializer.serializeToString(elem)).join('');
		} else {
			listenerMap.forEach((listener, i) => {
				const listenerElem = doc.querySelector(`[data-__listener="${i}"]`);

				if (listenerElem) {
					listenerElem.addEventListener(listener.event, (evt) => listener.cb.call(listenerElem, evt));
					listenerElem.removeAttribute('data-__listener');
					return;
				}

				console.error('listener elem not found', i);
			});

			const componentElems = Array.from(doc.querySelectorAll('[data-__cid]'));
			componentElems.forEach((elem) => {
				elem.removeAttribute('xmlns');

				const component = componentList[elem.getAttribute('data-__cid')];
				if (elemMap.has(component)) {
					elemMap.get(component).push(elem);
				} else {
					elemMap.set(component, [elem]);
				}

				elem.removeAttribute('data-__cid');
			});

			componentIdx = 0;
			componentList = [];

			return elems;
		}
	};

	window.state = function state(component, initial) {
		const state = new Proxy(initial || {}, {
			get: (s, p) => s[p],
			set: (s, p, val) => {
				if (elemMap.has(component)) {
					const elements = elemMap.get(component);
					s[p] = val;
					const result = component.render();
					elemMap.set(component, result);

					result.forEach((elem, i) => {
						if (i < elements.length) {
							const shouldFocus = document.activeElement === elements[i];
							elements[i].replaceWith(elem);
							if (shouldFocus) {
								requestAnimationFrame(() => {
									elem.focus();
									if (elem.setSelectionRange) {
										elem.setSelectionRange(elem.value.length, elem.value.length, 'forward');
									}
								});
							}
						} else {
							result[i - 1].insertAdjacentElement('afterend'.elem);
						}
					});

					if (elements.length > result.length) {
						elements.slice(result.length).forEach((elem) => elem.remove());
					}

					return true;
				}
			}
		});

		return state;
	};

	function resolve(expr) {
		let newComponent = null;

		if (Array.isArray(expr)) {
			return expr.map((expr) => resolve(expr));
		}

		if (expr instanceof Component) {
			const result = expr._render();

			return result instanceof Component ? resolve(result) : result;
		} else if ((newComponent = tryConstruct(expr)) instanceof Component) {
			return resolve(newComponent);
		} else {
			return expr;
		}
	}

	function tryConstruct(MaybeConstructor) {
		try {
			return new MaybeConstructor();
		} catch {
			return null;
		}
	}

	Component.prototype._render = function _render() {
		renderStack.unshift(renderComponent);
		renderComponent = this;
		const result = this.render();
		renderComponent = renderStack.shift();
		return result;
	};
})();

