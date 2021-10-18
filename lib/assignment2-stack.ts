import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from "@aws-cdk/aws-ec2";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import { readFileSync } from "fs";

export class Assignment2Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //The code that defines your stack goes here
    //Define IAM Group
    const group = new iam.Group(this, "first-group", {
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
        // iam.ManagedPolicy.fromManagedPolicyArn(this, "AdministratorAccess", "arn:aws:iam::aws:policy/service-role/AdministratorAccess"),

      ],
    });
    //Create Managed Policy
    // const loggingManagedPolicy = iam.ManagedPolicy.fromManagedPolicyArn(this, "AdministratorAccess", "arn:aws:iam::aws:policy/service-role/AdministratorAccess");
    const loggingManagedPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AdministratorAccess"
    );

    //Create Permissions Boundary
    const permissionsBoundary = new iam.ManagedPolicy(
      this,
      "permissions-boundary",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            actions: ["sqs:*"], //permission boundary denies any 'sqs' related action
            resources: ["*"],
          }),
        ],
      }
    );

    // create user
    const user = new iam.User(this, "user-1", {
      userName: "user-1",
      managedPolicies: [loggingManagedPolicy],
      groups: [group],
      permissionsBoundary,
    });

    // create vpc & subnets
    const vpc = new ec2.Vpc(this, "CustomVPC", {
      cidr: "10.0.0.0/16",
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 26,
          name: "privateSubnet",
          subnetType: SubnetType.PRIVATE_WITH_NAT,
        },
        {
          cidrMask: 26,
          name: "publicSubnet",
          subnetType: SubnetType.PUBLIC,
          //availabilityzone ?
        },
      ],
    });

    // create security groups
    const ingressSecurityGroup = new SecurityGroup(
      this,
      "ingress-security-group",
      {
        vpc: vpc,
        description: 'Allow ssh access to ec2 instances',
        allowAllOutbound: true,
        securityGroupName: "IngressSecurityGroup",
      }
    );
    ingressSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("10.0.0.0/16"),
      ec2.Port.tcp(3306)
    );

    const egressSecurityGroup = new SecurityGroup(
      this,
      "egress-security-group",
      {
        vpc: vpc,
        allowAllOutbound: true,
        securityGroupName: "EgressSecurityGroup",
      }
    );
    egressSecurityGroup.addEgressRule(Peer.anyIpv4(), Port.tcp(80));

    //This part is to install nginx server but i didnot manage.

  //   // // create a Role for the EC2 Instance
  //   const webserverRole = new iam.Role(this, 'webserver-role', {
  //     assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
  //     managedPolicies: [
  //       iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
  //     ],
  //   });
  
  //  // //create the EC2 instance
  //  const ec2Instance = new ec2.Instance(this, 'ec2-instance', {
  //   vpc,
  //   vpcSubnets: {
  //     subnetType: ec2.SubnetType.PUBLIC,  
  //   },
  //   role: webserverRole,
  //   //securityGroup: webserverSG,
  //   instanceType: ec2.InstanceType.of(
  //     ec2.InstanceClass.T2,
  //     ec2.InstanceSize.MICRO,
  //   ),
  //   machineImage: new ec2.AmazonLinuxImage({
  //     generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
  //   }),
  //   //keyName: 'ec2-key-pair',
  // });


  //   //Load contents of script
  //   const userDataScript = readFileSync('./lib/user-data.sh', 'utf8');
  
  //   // add user data script to the instance
  //   ec2Instance.addUserData(userDataScript);

    //autoscaling of the vm
    const asg = new autoscaling.AutoScalingGroup(this, "ASG", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2, 
        ec2.InstanceSize.MICRO
      ),
      //init: ec2.CloudFormationInit.fromElements( ec2.InitCommand.shellCommand("apt install nginx")),
      //signals: autoscaling.Signals.waitForAll({  
     // }),
      machineImage: new ec2.AmazonLinuxImage(),
      minCapacity: 2,
      maxCapacity: 5,
    });

    // Loadbalancer
    const lb = new elbv2.ApplicationLoadBalancer(this, "LB", {
      vpc,
      internetFacing: true,
    });

    // Listener
    const listener = lb.addListener("Listener", {
      port: 80,
    });

    //connect Load balancer & autoscaling group
    listener.addTargets("Target", {
      port: 80,
      targets: [asg],
    });

    listener.connections.allowDefaultPortFromAnyIpv4("Open to the world");

    //scale on request
    asg.scaleOnRequestCount("AModestLoad", {
      targetRequestsPerSecond: 100,
    });
  }
}

const app = new cdk.App();
new Assignment2Stack(app, "Stack");
app.synth();
