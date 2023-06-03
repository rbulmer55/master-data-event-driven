import Ajv from 'ajv';
import { S3Event } from 'aws-lambda';
import { S3 } from '@aws-sdk/client-s3';
import { schema } from './schemas/data-cleanser-schema';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const ajv = new Ajv();
const s3 = new S3({});
const ddb = new DynamoDBClient({ region: 'eu-west-1' });

type MasterDataObj = {
	data: [
		{
			name: string;
			values: string[];
		}
	];
};

export const handler = async (event: S3Event) => {
	const { SOURCE_BUCKET: srcBucketName, TABLE: tableName } = process.env;

	if (!srcBucketName || !tableName) {
		throw new Error(
			'Error: Either the source bucket or table has not been provided.'
		);
	}

	for await (const record of event.Records) {
		console.log(event.Records);
		const rawObject = await s3.getObject({
			Key: record.s3.object.key,
			Bucket: srcBucketName || '',
		});

		const dataString = await rawObject.Body?.transformToString();
		console.log(dataString);

		// const dataObject: MasterDataObj = JSON.parse(
		// 	rawObject.Body?.toString() || ''
		// );
		const dataObject: MasterDataObj = JSON.parse(dataString || '');

		//debug
		console.log(dataObject);

		if (!ajv.validate(schema, dataObject)) {
			throw new Error(
				'Imported data is invalid, please ensure it matches the schema.'
			);
		}

		// const object = {
		// 	data: [
		// 		{
		// 			name: 'customer_status',
		// 			values: ['ACTIVE'],
		// 		},
		// 	],
		// };

		//ddb write items
		await Promise.all(
			dataObject.data.map(async ({ name, values }) => {
				await Promise.all(
					values.map(async (value) => {
						const dt = new Date();
						const putItemCmd = new PutItemCommand({
							TableName: tableName,
							Item: marshall({
								pk: `master#${name}`,
								sk: `${value}#${dt.toLocaleDateString('en-GB')}`,
								modifiedBy: 'u123',
								modifiedAt: dt.toISOString(),
							}),
						});
						console.log(putItemCmd);
						return await ddb.send(putItemCmd);
					})
				);
			})
		);
		console.log('done');
	}
};
