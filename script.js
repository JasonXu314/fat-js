const root = document.getElementById('root');

// root.append(...$html`<a href="https://google.com"><p on:click=${() => console.log('hi')}>hi</p></a>`.elems);
// root.append(
// 	...$html`<a href="https://google.com">${$if(Math.random() > 0.5)`Hi`(Math.random() > 0.5)`Hi 2`(Math.random() > 0.5)`Hi 3`(true)`asdf`}</a>`.elems
// );
// const arr = new Array(50).fill(null).map(() => [Math.random(), Math.random()]);
// console.log(arr);
// root.append(
// 	...$html`<ul>
// 	${$each(arr)(
// 		([a, b]) => $html`
// 	<li>
// 		${$if(a > 0)`<div>${b}</div>`(b > 0.5)`<div>Hi</div>`(true)`<div>nothing</div>`}
// 	</li>
// 	`
// 	)}
// </ul>`.elems
// );
// root.append(...$html`<asdf>test</asdf>`.elems);
// root.append(...$html`<button on:click=${() => console.log('hi')}>hi</button>`.elems);

// class Button extends Component {
// 	render({ label }) {
// 		return $html`<button on:click=${() => this.emit('asdf', 'hi')}>${label}</button>`;
// 	}
// }

// root.append(...$html`<${Button} on:asdf=${(evt) => console.log(evt)} label="hi"</>`.elems);

// const state = new State('asdf');

// root.append(
// 	...$html`
// 	<input value=${state} on:change=${(evt) => state.set(evt.target.value)}></input>
// 	<button on:click=${() => state.set('hi')}>${state}</button>
// `.elems
// );

const state = new State(''),
	/** @type {State<{ todo: string, completed: State<boolean> }[]>} */
	todos = new State([]);

root.append(
	...$html`
	<main class="container">
		<input bind:value=${state}></input>
		<button on:click=${() => todos.set((todos) => [...todos, { todo: state.value, completed: new State(false) }])}>Add Todo</button>
		<ul>
			${$each(todos)(
				(todo, i) => $html`<li style="display: flex; flex-direction: row; justify-content: space-between;">
				${todo.todo}
				<input type="checkbox" bind:checked=${todo.completed}></input>
				<button on:click=${() => todos.set((todos) => todos.filter((_, j) => i !== j))}>X</button>
			</li>`
			)}
		</ul>
		<button on:click=${() => console.log(todos.value)}>CLG</button>
	</main>
`.elems
);

