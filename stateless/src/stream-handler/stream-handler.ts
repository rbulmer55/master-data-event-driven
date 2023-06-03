import { DynamoDBStreamEvent } from 'aws-lambda';
import {
	EventBridgeClient,
	PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';

const eb = new EventBridgeClient({});

type MasterDynamoDBRecord = {
	pk: string;
	sk: string;
	modifiedBy: string;
	modifiedAt: string;
};

type MasterRecordChange = {
	name: string;
	value: string;
	changedAt: string;
};

export const handler = async (event: DynamoDBStreamEvent) => {
	for await (const { dynamodb } of event.Records) {
		console.log('DynamoDB Record: %j', dynamodb);

		if (dynamodb && dynamodb.NewImage) {
			const obj = unmarshall(
				dynamodb.NewImage as { [key: string]: AttributeValue }
			) as MasterDynamoDBRecord;

			const changeDetail: MasterRecordChange = {
				name: obj.pk.split('#')[1],
				value: obj.sk.split('#')[0],
				changedAt: obj.modifiedAt,
			};
			// Set the parameters.
			const params = {
				Entries: [
					{
						Detail: JSON.stringify(changeDetail),
						DetailType: 'masterDataChange',
						Source: 'masterdata.app',
					},
				],
			};
			console.log(params);
			await eb.send(new PutEventsCommand(params));
			console.log('done');
		}
	}
};
