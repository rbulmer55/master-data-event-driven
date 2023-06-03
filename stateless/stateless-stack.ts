import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, StartingPosition, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
	AwsCustomResource,
	AwsCustomResourcePolicy,
	PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as eb from 'aws-cdk-lib/aws-events';

interface customProps extends cdk.StackProps {
	table: ddb.Table;
	uploadBucket: s3.Bucket;
	topic: sns.Topic;
}

export class MasterDataEventDrivenStatelessStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: customProps) {
		super(scope, id, props);

		if (!props?.uploadBucket || !props.table) {
			throw new Error('Error: Properties from stateful stack not defined');
		}

		const cleanserHandler = new nodeLambda.NodejsFunction(
			this,
			'data-cleanser',
			{
				runtime: Runtime.NODEJS_18_X,
				functionName: 'master-data-cleanser',
				entry: path.join(__dirname, 'src/data-cleanser/data-cleanser.ts'),
				handler: 'handler',
				tracing: Tracing.ACTIVE,
				memorySize: 256,
				bundling: {
					minify: true,
				},
				environment: {
					SOURCE_BUCKET: props.uploadBucket.bucketName,
					TABLE: props.table.tableName,
				},
			}
		);

		/*
		 * Event Notifcation (across stacks) Workaround. Bug: https://github.com/aws/aws-cdk/issues/5760
		 */
		// props.uploadBucket.addEventNotification(
		// 	s3.EventType.OBJECT_CREATED_PUT,
		// 	new LambdaDestination(cleanserHandler)
		// );

		// const s3PutEventSource = new cdk.aws_lambda_event_sources.S3EventSource(
		// 	props.uploadBucket,
		// 	{
		// 		events: [s3.EventType.OBJECT_CREATED_PUT],
		// 	}
		// );
		// cleanserHandler.addEventSource(s3PutEventSource);

		cleanserHandler.addPermission(`AllowS3Invocation`, {
			action: 'lambda:InvokeFunction',
			principal: new iam.ServicePrincipal('s3.amazonaws.com'),
			sourceArn: props.uploadBucket.bucketArn,
		});

		const notificationResource = new AwsCustomResource(
			this,
			`NotificationCustomResource`,
			{
				logRetention: RetentionDays.THREE_DAYS,
				policy: AwsCustomResourcePolicy.fromStatements([
					new iam.PolicyStatement({
						effect: iam.Effect.ALLOW,
						actions: ['s3:PutBucketNotification'],
						resources: [
							props.uploadBucket.bucketArn,
							`${props.uploadBucket.bucketArn}/*`,
						],
					}),
				]),
				onCreate: {
					service: 'S3',
					action: 'putBucketNotificationConfiguration',
					parameters: {
						Bucket: props.uploadBucket.bucketName,
						NotificationConfiguration: {
							LambdaFunctionConfigurations: [
								{
									Events: ['s3:ObjectCreated:*'],
									LambdaFunctionArn: cleanserHandler.functionArn,
								},
							],
						},
					},
					physicalResourceId: PhysicalResourceId.of(
						`${id + Date.now().toString()}`
					),
				},
			}
		);

		notificationResource.node.addDependency(
			cleanserHandler.permissionsNode.findChild('AllowS3Invocation')
		);

		props.uploadBucket.grantRead(cleanserHandler);
		props.table.grantWriteData(cleanserHandler);

		const streamHandler = new nodeLambda.NodejsFunction(
			this,
			'master-data-stream-handler',
			{
				runtime: Runtime.NODEJS_18_X,
				functionName: 'master-data-stream-handler',
				entry: path.join(__dirname, 'src/stream-handler/stream-handler.ts'),
				handler: 'handler',
				tracing: Tracing.ACTIVE,
				memorySize: 256,
				bundling: {
					minify: true,
				},
				environment: {},
			}
		);

		props.table.grantReadData(streamHandler);
		eb.EventBus.grantAllPutEvents(streamHandler);

		// enable the stream
		streamHandler.addEventSource(
			new DynamoEventSource(props.table, {
				startingPosition: StartingPosition.LATEST,
			})
		);
	}
}
