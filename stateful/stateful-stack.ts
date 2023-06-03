import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as eb from 'aws-cdk-lib/aws-events';
import { SnsTopic } from 'aws-cdk-lib/aws-events-targets';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';

export class MasterDataEventDrivenStatefulStack extends cdk.Stack {
	public readonly table: ddb.Table;
	public readonly uploadBucket: s3.Bucket;
	public readonly topic: sns.Topic;

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const table = new ddb.Table(this, 'master-data-table', {
			billingMode: ddb.BillingMode.PAY_PER_REQUEST,
			partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
			sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
			stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
		});
		this.table = table;

		const uploadBucket = new s3.Bucket(this, 'upload-bucket', {
			objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});
		this.uploadBucket = uploadBucket;

		const rule = new eb.Rule(this, 'master-data-event-rule', {
			eventPattern: {
				source: ['masterdata.app'],
			},
		});

		const dataTopic = new sns.Topic(this, 'master-event-topic', {});
		this.topic = dataTopic;

		rule.addTarget(new SnsTopic(dataTopic));

		dataTopic.addSubscription(new EmailSubscription('email@address.com'));
	}
}
