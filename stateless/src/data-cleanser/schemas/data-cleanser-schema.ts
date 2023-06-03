export const schema = {
	type: 'object',
	required: ['data'],
	maxProperties: 1,
	minProperties: 1,
	properties: {
		data: {
			type: 'array',
			items: {
				type: 'object',
				required: ['name', 'values'],
				properties: {
					name: {
						type: 'string',
						pattern: '^[a-z_-]+$',
					},
					values: {
						type: 'array',
						items: {
							type: 'string',
							pattern: '^[a-zA-Z_-]+$',
						},
					},
				},
			},
		},
	},
};
/**
 * {
 *  data: [{
 * 	name:"customer_status"
 *  values:["ACTIVE"]
 * }]
 * }
 */
