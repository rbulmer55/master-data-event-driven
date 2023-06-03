#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MasterDataEventDrivenStatefulStack } from '../stateful/stateful-stack';
import { MasterDataEventDrivenStatelessStack } from '../stateless/stateless-stack';

const app = new cdk.App();

const statefulStack = new MasterDataEventDrivenStatefulStack(
	app,
	'MasterDataEventDrivenStatefulStack',
	{}
);

new MasterDataEventDrivenStatelessStack(
	app,
	'MasterDataEventDrivenStatelessStack',
	{
		table: statefulStack.table,
		uploadBucket: statefulStack.uploadBucket,
		topic: statefulStack.topic,
	}
);
